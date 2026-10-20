/**
 * 正式分錄 router — Phase 3 tRPC Push + Hash 雜湊鏈寫入
 * 伺服器二次覆核（不信任前端驗證）→ SHA-256 鏈 → 快照級聯 → 審計
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, procedure } from "@/server/trpc/init";
import { authed, admin } from "@/server/trpc/procedures";
import { entrySchema } from "@/server/schemas";
import { postEntry, voidEntry, PostingError } from "@/server/services/posting";

export const journalRouter = router({
  /** 推送正式分錄（本地驗證通過後呼叫；伺服器仍會二次覆核） */
  post: authed.input(entrySchema).mutation(async ({ ctx, input }) => {
    if (!ctx.session.activeCompanyId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });
    }
    try {
      const result = await postEntry({
        companyId: ctx.session.activeCompanyId,
        userId: ctx.session.user.id,
        entryDate: input.entryDate,
        description: input.description,
        lines: input.lines,
        ip: ctx.ip,
      });
      return result;
    } catch (e) {
      if (e instanceof PostingError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e.message,
          cause: e,
        });
      }
      throw e;
    }
  }),

  /** 分錄列表（含明細，最新在前） */
  list: authed
    .input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session.activeCompanyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });
      }
      const where = { companyId: ctx.session.activeCompanyId };
      const [total, entries] = await ctx.prisma.$transaction([
        ctx.prisma.journalEntry.count({ where }),
        ctx.prisma.journalEntry.findMany({
          where,
          orderBy: { entryNo: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          include: {
            lines: {
              include: { account: { select: { name: true } } },
              orderBy: { debit: "desc" },
            },
            createdBy: { select: { name: true, email: true } },
          },
        }),
      ]);
      return { total, entries };
    }),

  /** 作廢分錄（僅 ADMIN/OWNER；hash 鏈不變，快照回沖） */
  void: admin
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await voidEntry({
        companyId: ctx.session.activeCompanyId!,
        userId: ctx.session.user.id,
        entryId: input.entryId,
        ip: ctx.ip,
      });
      return { ok: true };
    }),
});
