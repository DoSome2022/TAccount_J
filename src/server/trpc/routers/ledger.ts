/**
 * 高效總帳與報表 router（Phase 4）
 * 效能鐵律：所有查詢基於 account_period_balances 快照，
 * 絕不對 journal_lines 全表 SUM()。查詢成本 = O(帳戶數)，與分錄總量無關。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router } from "@/server/trpc/init";
import { authed } from "@/server/trpc/procedures";
import { allAccountBalancesAt } from "@/server/snapshots";
import { prevPeriod, periodOf } from "@/server/accounting";
import { recomputeChain } from "@/server/hashchain";

const PERIOD_RE = /^\d{4}-\d{2}$/;

/** 帳戶結餘列：signed balance（借正貸負）拆成試算表的借/貸欄 */
function toTrialRow(a: {
  code: string;
  name: string;
  type: string;
  normal: string;
  balance: Prisma.Decimal;
}) {
  const debit = a.balance.greaterThan(0) ? a.balance : new Prisma.Decimal(0);
  const credit = a.balance.lessThan(0) ? a.balance.negated() : new Prisma.Decimal(0);
  return { ...a, debit, credit };
}

export const ledgerRouter = router({
  /** 試算表：截至指定期別的全帳戶結餘 */
  trialBalance: authed
    .input(z.object({ period: z.string().regex(PERIOD_RE).optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.session.activeCompanyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });

      const period = input.period ?? periodOf(new Date());
      const [accounts, balances] = await Promise.all([
        ctx.prisma.accountChart.findMany({
          where: { companyId, isActive: true },
          select: { code: true, name: true, type: true, normal: true },
          orderBy: { code: "asc" },
        }),
        allAccountBalancesAt(ctx.prisma, companyId, period),
      ]);

      const rows = accounts.map((a) =>
        toTrialRow({ ...a, balance: balances.get(a.code) ?? new Prisma.Decimal(0) }),
      );
      const totalDebit = rows.reduce((s, r) => s.plus(r.debit), new Prisma.Decimal(0));
      const totalCredit = rows.reduce((s, r) => s.plus(r.credit), new Prisma.Decimal(0));

      return { period, rows, totalDebit, totalCredit, balanced: totalDebit.equals(totalCredit) };
    }),

  /** 資產負債表（快照直讀；含會計恆等式驗證） */
  balanceSheet: authed
    .input(z.object({ period: z.string().regex(PERIOD_RE).optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.session.activeCompanyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });

      const period = input.period ?? periodOf(new Date());
      const [accounts, balances] = await Promise.all([
        ctx.prisma.accountChart.findMany({
          where: { companyId, isActive: true },
          select: { code: true, name: true, type: true },
          orderBy: { code: "asc" },
        }),
        allAccountBalancesAt(ctx.prisma, companyId, period),
      ]);
      const bal = (code: string) => balances.get(code) ?? new Prisma.Decimal(0);

      const group = (types: string[]) =>
        accounts
          .filter((a) => types.includes(a.type))
          .map((a) => ({ code: a.code, name: a.name, balance: bal(a.code) }));

      const assets = group(["ASSET"]);
      const liabilities = group(["LIABILITY"]);
      const equity = group(["EQUITY"]);
      const revenue = group(["REVENUE"]);
      const cogs = group(["COGS"]);
      const expenses = group(["EXPENSE"]);

      const sum = (rows: { balance: Prisma.Decimal }[]) =>
        rows.reduce((s, r) => s.plus(r.balance), new Prisma.Decimal(0));

      const totalAssets = sum(assets);
      const totalLiabilities = sum(liabilities);
      const totalEquity = sum(equity);
      // 本期損益（累計）＝ 收入(貸,負) − 銷貨成本(借,正) − 費用(借,正)，signed 值
      const netIncome = sum(revenue)
        .plus(sum(cogs))
        .plus(sum(expenses));

      // 會計恆等式（signed 平衡）：資產 + 銷貨成本 + 費用 = 負債 + 資本 + 收入
      // 貸方類科目以 signed（負值）相加，因此兩側之和應為 0
      const lhs = totalAssets.plus(sum(cogs)).plus(sum(expenses));
      const rhs = totalLiabilities.plus(totalEquity).plus(sum(revenue));
      const identityHolds = lhs.plus(rhs).isZero();

      return {
        period,
        assets,
        liabilities,
        equity,
        netIncome,
        totalAssets,
        totalLiabilities,
        totalEquity,
        identityHolds,
      };
    }),

  /** 損益表：本期異動 = 期末快照 − 前期快照 */
  incomeStatement: authed
    .input(z.object({ period: z.string().regex(PERIOD_RE).optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.session.activeCompanyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });

      const period = input.period ?? periodOf(new Date());
      const prev = prevPeriod(period);
      const [accounts, cur, pre] = await Promise.all([
        ctx.prisma.accountChart.findMany({
          where: { companyId, isActive: true, type: { in: ["REVENUE", "COGS", "EXPENSE"] } },
          select: { code: true, name: true, type: true },
          orderBy: { code: "asc" },
        }),
        allAccountBalancesAt(ctx.prisma, companyId, period),
        allAccountBalancesAt(ctx.prisma, companyId, prev),
      ]);

      const rows = accounts.map((a) => {
        const curBal = cur.get(a.code) ?? new Prisma.Decimal(0);
        const preBal = pre.get(a.code) ?? new Prisma.Decimal(0);
        // 損益表金額一律以「正數」呈現：
        //  收入（貸方正常）: amount = preBal - curBal（signed 為負，負負得正）
        //  銷貨成本/費用（借方正常）: amount = curBal - preBal（signed 為正）
        const movement = curBal.minus(preBal);
        const amount = a.type === "REVENUE" ? movement.negated() : movement;
        return {
          code: a.code,
          name: a.name,
          type: a.type,
          amount,
        };
      });
      const sumBy = (t: string) =>
        rows.filter((r) => r.type === t).reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));

      const revenue = sumBy("REVENUE");
      const cogs = sumBy("COGS");
      const expenses = sumBy("EXPENSE");
      return {
        period,
        rows,
        revenue,
        cogs,
        grossProfit: revenue.minus(cogs),
        expenses,
        netIncome: revenue.minus(cogs).minus(expenses),
      };
    }),

  /** Hash 鏈完整性校驗（隨時檢查歷史分錄是否遭竄改） */
  verifyChain: authed.query(async ({ ctx }) => {
    const companyId = ctx.session.activeCompanyId;
    if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });

    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { genesisHash: true },
    });
    const entries = await ctx.prisma.journalEntry.findMany({
      where: { companyId },
      orderBy: { entryNo: "asc" },
      include: {
        lines: {
          select: { accountCode: true, debit: true, credit: true, description: true },
          orderBy: { accountCode: "asc" },
        },
      },
    });
    const broken = recomputeChain(
      company.genesisHash,
      entries.map((e) => ({
        entryNo: e.entryNo,
        entryDate: e.entryDate,
        description: e.description,
        hash: e.hash,
        prevHash: e.prevHash,
        status: e.status,
        lines: e.lines.map((l) => ({
          accountCode: l.accountCode,
          debit: l.debit.toFixed(2),
          credit: l.credit.toFixed(2),
          description: l.description,
        })),
      })),
    );
    return {
      ok: broken.length === 0,
      checked: entries.length,
      genesisHash: company.genesisHash,
      broken: broken.map((b) => ({ entryNo: b.entryNo, expected: b.expected, stored: b.stored })),
    };
  }),
});
