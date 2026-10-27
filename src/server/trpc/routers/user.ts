import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "@/server/trpc/init";
import { admin } from "@/server/trpc/procedures";

/**
 * 用戶管理（ADMIN/OWNER）：
 *  - 凍結／解凍公司成員（凍結者無法登入，layout/tRPC 防線即時生效）
 *  - 不可凍結自己；ADMIN 不可凍結 OWNER
 */
export const userRouter = router({
  /** 目前公司成員清單 */
  listMembers: admin.query(async ({ ctx }) => {
    const rows = await ctx.prisma.userCompany.findMany({
      where: { companyId: ctx.session.activeCompanyId },
      include: {
        user: { select: { id: true, email: true, name: true, isFrozen: true } },
      },
      orderBy: [{ role: "asc" }, { user: { createdAt: "asc" } }],
    });
    return rows.map((r) => ({
      userId: r.user.id,
      email: r.user.email,
      name: r.user.name,
      role: r.role,
      isFrozen: r.user.isFrozen,
    }));
  }),

  /** 凍結／解凍（寫入 audit log，與更新同一交易） */
  setFrozen: admin
    .input(
      z.object({
        userId: z.string(),
        frozen: z.boolean(),
        reason: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.session.activeCompanyId;
      const actorId = ctx.session.user.id;
      const actorRole = ctx.session.activeRole;

      const membership = await ctx.prisma.userCompany.findUnique({
        where: { userId_companyId: { userId: input.userId, companyId } },
        include: { user: { select: { email: true } } },
      });
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "該使用者不是本公司成員" });
      }
      if (input.userId === actorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能凍結自己的帳號" });
      }
      // 只有 OWNER 能凍結 OWNER
      if (membership.role === "OWNER" && actorRole !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "僅公司負責人（OWNER）可凍結 OWNER" });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: input.userId },
          data: {
            isFrozen: input.frozen,
            frozenAt: input.frozen ? new Date() : null,
            frozenReason: input.frozen ? input.reason?.trim() || null : null,
          },
        }),
        ctx.prisma.auditLog.create({
          data: {
            companyId,
            userId: actorId,
            action: input.frozen ? "USER_FREEZE" : "USER_UNFREEZE",
            entity: "User",
            entityId: input.userId,
            details: { email: membership.user.email, reason: input.reason?.trim() || null },
            ip: ctx.ip,
          },
        }),
      ]);

      return { ok: true, frozen: input.frozen };
    }),
});
