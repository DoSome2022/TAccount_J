import { Prisma, type PrismaClient } from "@/generated/prisma/client";

/**
 * 效能鐵律：報表嚴禁對 journal_lines 全表 SUM()。
 * 採用「期末結餘快照 + 本期異動」增量模型：
 *  - account_period_balances 存放每帳戶每期的「期末累計結餘」（借方為正）
 *  - 每筆分錄寫入時，僅對其期別及「所有後續已存在快照的期別」做增量加總（級聯）
 *  - 讀取任一期的結餘 = 取該帳戶「期別 ≤ P 的最新一筆快照」，O(1)
 *  - 報表查詢與分錄總數無關
 *
 * 不變量（Invariant）：
 *  每一筆存在的快照列 = 該帳戶「截至該期為止」的累計結餘。
 *  為維持不變量，新列建立時必須以「前一期的快照」作為期初，而不是 0。
 */

export type Delta = { accountCode: string; signedDelta: Prisma.Decimal };

/** 計算一筆分錄對各帳戶的簽名增量（借為正、貸為負） */
export function entryDeltas(
  lines: { accountCode: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[],
): Delta[] {
  return lines.map((l) => ({
    accountCode: l.accountCode,
    signedDelta: l.debit.minus(l.credit),
  }));
}

/**
 * 於同一交易內更新快照（含級聯到後續期別）。
 * @param tx Prisma 交易
 * @param companyId 租戶
 * @param period 分錄所屬期別
 * @param deltas 各帳戶簽名增量
 */
export async function applyEntryToSnapshots(
  tx: Prisma.TransactionClient,
  companyId: string,
  period: string,
  deltas: Delta[],
): Promise<void> {
  // 1) 本期的所有後續期別快照（需級聯；依期別升序，確保期初可讀到剛更新的前期）
  const laterPeriods = (
    await tx.accountPeriodBalance.findMany({
      where: { companyId, period: { gt: period } },
      select: { period: true },
      distinct: ["period"],
    })
  )
    .map((r) => r.period)
    .sort();
  const cascadeTargets = [period, ...laterPeriods];

  // 2) 對每個受影響帳戶 × 每個級聯期別，增量加總
  //    （帳戶數 × 期別數，與分錄總量無關 → 常數級效能）
  for (const d of deltas) {
    for (const p of cascadeTargets) {
      const key = { companyId, accountCode: d.accountCode, period: p };
      const existing = await tx.accountPeriodBalance.findUnique({
        where: { companyId_accountCode_period: key },
      });
      if (existing) {
        await tx.accountPeriodBalance.update({
          where: { companyId_accountCode_period: key },
          data: { balance: { increment: d.signedDelta } },
        });
      } else {
        // 新列：期初 = 前一期最新快照（維持「累計結餘」不變量）
        const opening = await tx.accountPeriodBalance.findFirst({
          where: {
            companyId,
            accountCode: d.accountCode,
            period: { lt: p },
          },
          orderBy: { period: "desc" },
          select: { balance: true },
        });
        await tx.accountPeriodBalance.create({
          data: {
            ...key,
            balance: (opening?.balance ?? new Prisma.Decimal(0)).plus(d.signedDelta),
          },
        });
      }
    }
  }
}

/** 讀取某帳戶截至某期的結餘（取期別 ≤ P 的最新快照，O(1)） */
export async function accountBalanceAt(
  db: Prisma.TransactionClient | PrismaClient,
  companyId: string,
  accountCode: string,
  period: string,
): Promise<Prisma.Decimal> {
  const snap = await db.accountPeriodBalance.findFirst({
    where: { companyId, accountCode, period: { lte: period } },
    orderBy: { period: "desc" },
    select: { balance: true },
  });
  return snap?.balance ?? new Prisma.Decimal(0);
}

/**
 * 讀取全公司所有帳戶截至某期的結餘（一次查詢，供總帳/報表使用）
 * 取每個帳戶「期別 ≤ P 的最新快照」。
 */
export async function allAccountBalancesAt(
  db: Prisma.TransactionClient | PrismaClient,
  companyId: string,
  period: string,
): Promise<Map<string, Prisma.Decimal>> {
  // PostgreSQL DISTINCT ON 取每帳戶最新快照
  const rows = await db.$queryRaw<
    { accountCode: string; balance: Prisma.Decimal }[]
  >`
    SELECT DISTINCT ON ("accountCode") "accountCode", balance
    FROM account_period_balances
    WHERE "companyId" = ${companyId} AND period <= ${period}
    ORDER BY "accountCode", period DESC
  `;
  return new Map(rows.map((r) => [r.accountCode, r.balance]));
}
