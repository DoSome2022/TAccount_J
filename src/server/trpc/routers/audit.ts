import { z } from "zod";
import { router } from "@/server/trpc/init";
import { admin } from "@/server/trpc/procedures";

/** 審計日誌（鐵律：所有關鍵異動皆可追蹤） */
export const auditRouter = router({
  list: admin
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.auditLog.findMany({
        where: { companyId: ctx.session.activeCompanyId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: { user: { select: { name: true, email: true } } },
      });
    }),
});
