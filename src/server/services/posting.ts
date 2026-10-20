import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import {
  canonicalizeEntry,
  computeEntryHash,
  isBalanced,
  LineInput,
  periodOf,
} from "@/server/accounting";
import { applyEntryToSnapshots, entryDeltas } from "@/server/snapshots";

export class PostingError extends Error {
  code: "UNBALANCED" | "INVALID_ACCOUNT" | "CHAIN_CONFLICT" | "NOT_FOUND";
  constructor(code: PostingError["code"], msg: string) {
    super(msg);
    this.code = code;
  }
}

export type PostEntryResult = {
  entryId: string;
  entryNo: number;
  hash: string;
  prevHash: string;
};

const AMOUNT_RE = /^\d{1,15}(\.\d{1,2})?$/;

/** 驗證金額格式與借貸平衡（伺服器二次覆核鐵律，與前端驗證互相獨立） */
function validateEntry(input: { lines: LineInput[] }): void {
  if (input.lines.length === 0) {
    throw new PostingError("UNBALANCED", "分錄至少需要一筆明細");
  }
  for (const l of input.lines) {
    if (!AMOUNT_RE.test(l.debit) || !AMOUNT_RE.test(l.credit)) {
      throw new PostingError("UNBALANCED", `金額格式錯誤（${l.accountCode}）`);
    }
    const d = new Prisma.Decimal(l.debit || "0");
    const c = new Prisma.Decimal(l.credit || "0");
    if (d.lessThan(0) || c.lessThan(0) || (d.isZero() && c.isZero())) {
      throw new PostingError("UNBALANCED", `每行借貸不得同時為 0（${l.accountCode}）`);
    }
  }
  if (!isBalanced(input.lines)) {
    throw new PostingError("UNBALANCED", "借貸不平衡：Σ Debit 必須等於 Σ Credit");
  }
}

/**
 * 正式分錄寫入（Phase 3 後端二次覆核 + Phase 4 快照更新）。
 *
 * 鐵律執行順序：
 *  1. 伺服器二次驗證借貸平衡（不信任前端）
 *  2. 驗證所有 account_code 穩定引用該租戶的 accounts.code
 *  3. 鎖定公司列（FOR UPDATE）→ 取得 entryNo 與上一筆 hash（防並發斷鏈）
 *  4. Hash_n = SHA256(Hash_{n-1} + canonicalData_n) 寫入 journal_entries
 *  5. 增量更新 account_period_balances 快照（含後續期別級聯）
 *  6. 寫入 audit_log
 */
export async function postEntry(input: {
  companyId: string;
  userId: string;
  entryDate: string; // YYYY-MM-DD
  description: string;
  lines: LineInput[];
  ip?: string | null;
}): Promise<PostEntryResult> {
  validateEntry(input);

  const date = new Date(`${input.entryDate}T00:00:00.000Z`);

  // 科目必須存在、啟用、且屬於該租戶（穩定主鍵鐵律）
  const codes = [...new Set(input.lines.map((l) => l.accountCode))];
  const accounts = await prisma.accountChart.findMany({
    where: { companyId: input.companyId, code: { in: codes } },
    select: { code: true },
  });
  const validCodes = new Set(accounts.map((a) => a.code));
  const invalid = codes.filter((c) => !validCodes.has(c));
  if (invalid.length > 0) {
    throw new PostingError("INVALID_ACCOUNT", `科目不存在或非本租戶：${invalid.join(", ")}`);
  }

  const period = periodOf(date);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // 鎖定公司列，序列化同租戶寫入（hash 鏈並發安全）
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${input.companyId} FOR UPDATE`;

        const company = await tx.company.findUniqueOrThrow({
          where: { id: input.companyId },
          select: { genesisHash: true },
        });

        // 取得鏈尾
        const last = await tx.journalEntry.findFirst({
          where: { companyId: input.companyId },
          orderBy: { entryNo: "desc" },
          select: { entryNo: true, hash: true },
        });
        const entryNo = (last?.entryNo ?? 0) + 1;
        const prevHash = last?.hash ?? company.genesisHash;

        // 決定性序列化 → 雜湊鏈
        const canonical = canonicalizeEntry({
          entryNo,
          entryDate: input.entryDate,
          description: input.description,
          lines: input.lines,
        });
        const hash = computeEntryHash(prevHash, canonical);

        const entry = await tx.journalEntry.create({
          data: {
            companyId: input.companyId,
            entryNo,
            entryDate: date,
            description: input.description,
            hash,
            prevHash,
            createdById: input.userId,
            lines: {
              create: input.lines.map((l) => ({
                companyId: input.companyId,
                accountCode: l.accountCode,
                debit: new Prisma.Decimal(l.debit || "0"),
                credit: new Prisma.Decimal(l.credit || "0"),
                description: l.description,
              })),
            },
          },
        });

        // 快照增量更新（含後續期別級聯）
        await applyEntryToSnapshots(
          tx,
          input.companyId,
          period,
          entryDeltas(
            input.lines.map((l) => ({
              accountCode: l.accountCode,
              debit: new Prisma.Decimal(l.debit || "0"),
              credit: new Prisma.Decimal(l.credit || "0"),
            })),
          ),
        );

        // 審計日誌（鐵律：所有關鍵異動寫入 audit_log）
        await tx.auditLog.create({
          data: {
            companyId: input.companyId,
            userId: input.userId,
            action: "JOURNAL_POST",
            entity: "JournalEntry",
            entityId: entry.id,
            details: {
              entryNo,
              hash,
              lineCount: input.lines.length,
              amount: input.lines
                .reduce(
                  (s, l) => s.plus(new Prisma.Decimal(l.debit || "0")),
                  new Prisma.Decimal(0),
                )
                .toString(),
            },
            ip: input.ip,
          },
        });

        return { entryId: entry.id, entryNo, hash, prevHash };
      });
    } catch (e) {
      // 唯一鍵衝突（並發搶號/搶 hash）→ 重試
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }
  throw new PostingError("CHAIN_CONFLICT", "寫入衝突，請重試");
}

/**
 * 作廢分錄：不改動已寫入的 immutable 分錄（hash 鏈不變），
 * 僅將 status 標為 VOID 並以相反方向增量回沖快照，確保總帳正確。
 * （會計原則：錯誤以「反向分錄」更正，歷史永不竄改）
 */
export async function voidEntry(input: {
  companyId: string;
  userId: string;
  entryId: string;
  ip?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${input.companyId} FOR UPDATE`;
    const entry = await tx.journalEntry.findFirstOrThrow({
      where: { id: input.entryId, companyId: input.companyId },
      include: { lines: true },
    });
    if (entry.status === "VOID") return;

    const period = periodOf(entry.entryDate);
    const reverse = entryDeltas(
      entry.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit.negated(),
        credit: l.credit.negated(),
      })),
    );

    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: "VOID" },
    });
    await applyEntryToSnapshots(tx, input.companyId, period, reverse);
    await tx.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        action: "JOURNAL_VOID",
        entity: "JournalEntry",
        entityId: entry.id,
        details: { entryNo: entry.entryNo, hash: entry.hash },
        ip: input.ip,
      },
    });
  });
}
