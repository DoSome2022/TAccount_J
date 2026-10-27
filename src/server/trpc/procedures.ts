/**
 * 共用的權限程序：
 *  - authed：登入（session 收窄為非 null；Tenant Isolation 起點）
 *  - admin：登入 + ADMIN/OWNER 角色（activeCompanyId 收窄為 string）
 *  - adminOnly：登入 + ADMIN 角色（OWNER 不含：邀請功能專用）
 *  - assertActiveAccount：登入後每次請求查 DB 驗證帳號未凍結／公司訂閱有效
 *    （JWT 30 天有效，凍結需即時生效，不能只信 session）
 *
 * 注意：tRPC 11.19 對「鏈式 .use() / unstable_pipe」的 ctx 型別收窄失效，
 * 因此權限檢查集中在單一 middleware 內完成（單層 next({ctx}) 收窄正常）。
 */
import { TRPCError } from "@trpc/server";
import { procedure, middleware } from "@/server/trpc/init";
import type { Context } from "@/server/trpc/context";

type AuthedSession = NonNullable<Context["session"]>;

/**
 * 帳號狀態檢查（每次請求 PK 查詢，非表掃描）：
 *  - 用戶被 admin 凍結 → 401
 *  - 非 OWNER 且所屬公司訂閱非 ACTIVE → 401（OWNER 為付款人，可放行至付款頁）
 */
async function assertActiveAccount(ctx: Context) {
  const userId = ctx.session?.user?.id;
  if (!userId) return;
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { isFrozen: true },
  });
  if (user?.isFrozen) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "帳號已被凍結，請聯絡管理員" });
  }
  const role = ctx.session?.activeRole;
  const companyId = ctx.session?.activeCompanyId;
  if (role && role !== "OWNER" && companyId) {
    const company = await ctx.prisma.company.findUnique({
      where: { id: companyId },
      select: { subscriptionStatus: true },
    });
    if (!company || company.subscriptionStatus !== "ACTIVE") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "公司訂閱未生效，請聯絡公司負責人" });
    }
  }
}

export const authed = procedure.use(
  middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "未登入" });
    }
    await assertActiveAccount(ctx);
    return next({
      ctx: { ...ctx, session: ctx.session as AuthedSession },
    });
  }),
);

export const admin = procedure.use(
  middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "未登入" });
    }
    if (!ctx.session.activeCompanyId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });
    }
    const role = ctx.session.activeRole;
    if (role !== "ADMIN" && role !== "OWNER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "需要管理員權限" });
    }
    await assertActiveAccount(ctx);
    // 控制流已收窄：activeCompanyId 為 string、role 為 ADMIN|OWNER
    return next({
      ctx: {
        ...ctx,
        session: {
          ...ctx.session,
          activeCompanyId: ctx.session.activeCompanyId,
          activeRole: role,
        } as AuthedSession & { activeCompanyId: string; activeRole: "ADMIN" | "OWNER" },
      },
    });
  }),
);

/** 僅 ADMIN（OWNER 不含）：邀請功能專用（OWNER 無邀請權限） */
export const adminOnly = procedure.use(
  middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "未登入" });
    }
    if (!ctx.session.activeCompanyId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });
    }
    const role = ctx.session.activeRole;
    if (role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN", message: "需要管理員權限（ADMIN）" });
    }
    await assertActiveAccount(ctx);
    return next({
      ctx: {
        ...ctx,
        session: {
          ...ctx.session,
          activeCompanyId: ctx.session.activeCompanyId,
          activeRole: role,
        } as AuthedSession & { activeCompanyId: string; activeRole: "ADMIN" },
      },
    });
  }),
);
