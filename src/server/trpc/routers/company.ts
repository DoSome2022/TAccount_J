import { router } from "@/server/trpc/init";
import { authed } from "@/server/trpc/procedures";

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
});
