import { router } from "@/server/trpc/init";
import { authed } from "@/server/trpc/procedures";
import { TRPCError } from "@trpc/server";

/** 科目表（code 為穩定主鍵；分錄與報表都以其引用） */
export const accountRouter = router({
  list: authed.query(async ({ ctx }) => {
    if (!ctx.session.activeCompanyId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "尚未選擇公司" });
    }
    return ctx.prisma.accountChart.findMany({
      where: { companyId: ctx.session.activeCompanyId, isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true, type: true, normal: true },
    });
  }),
});
