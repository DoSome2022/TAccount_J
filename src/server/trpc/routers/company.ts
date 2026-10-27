import { TRPCError } from "@trpc/server";
import { router } from "@/server/trpc/init";
import { authed } from "@/server/trpc/procedures";
import { getStripe, getStripePriceId } from "@/server/stripe";

/** 使用者所屬公司（切換動作在 /api/company/switch 重新簽署 JWT） */
export const companyRouter = router({
  list: authed.query(async ({ ctx }) => {
    const rows = await ctx.prisma.userCompany.findMany({
      where: { userId: ctx.session.user.id },
      include: { company: { select: { id: true, name: true, code: true } } },
      orderBy: { company: { createdAt: "asc" } },
    });
    return rows.map((r) => ({
      companyId: r.company.id,
      name: r.company.name,
      code: r.company.code,
      role: r.role,
    }));
  }),

  /** 付款頁：目前公司訂閱狀態（以公司為收費單位，OWNER 為付款人） */
  billingStatus: authed.query(async ({ ctx }) => {
    const companyId = ctx.session.activeCompanyId;
    if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });

    const membership = await ctx.prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: ctx.session.user.id, companyId } },
      select: { role: true, company: { select: { name: true, subscriptionStatus: true, currentPeriodEnd: true } } },
    });
    if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "非本公司成員" });

    return {
      companyName: membership.company.name,
      subscriptionStatus: membership.company.subscriptionStatus,
      currentPeriodEnd: membership.company.currentPeriodEnd,
      isOwner: membership.role === "OWNER",
      priceConfigured: Boolean(getStripe() && getStripePriceId()),
    };
  }),
});
