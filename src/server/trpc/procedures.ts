/**
 * 共用的權限程序：
 *  - authed：登入（session 收窄為非 null；Tenant Isolation 起點）
 *  - admin：登入 + ADMIN/OWNER 角色（activeCompanyId 收窄為 string）
 *
 * 注意：tRPC 11.19 對「鏈式 .use() / unstable_pipe」的 ctx 型別收窄失效，
 * 因此權限檢查集中在單一 middleware 內完成（單層 next({ctx}) 收窄正常）。
 */
import { TRPCError } from "@trpc/server";
import { procedure, middleware } from "@/server/trpc/init";
import type { Context } from "@/server/trpc/context";

type AuthedSession = NonNullable<Context["session"]>;

export const authed = procedure.use(
  middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "未登入" });
    }
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
