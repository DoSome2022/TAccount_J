/**
 * Admin 邀請制 router（僅 ADMIN/OWNER）
 * 邀請連結只回傳一次（token 以 SHA-256 hash 存 DB，無法事後重建）。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "@/server/trpc/init";
import { admin } from "@/server/trpc/procedures";
import { createInvitation } from "@/server/invite";
import { Role } from "@/generated/prisma/enums";

const roleEnum = z.enum([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.VIEWER]);

export const inviteRouter = router({
  create: admin
    .input(
      z.object({
        email: z.string().email(),
        role: roleEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { token } = await createInvitation({
          companyId: ctx.session.activeCompanyId!,
          email: input.email,
          role: input.role,
          invitedById: ctx.session.user.id,
          ip: ctx.ip,
        });
        // 僅此一次回傳完整 token；DB 只存 hash
        return { link: `/invite/${token}` };
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "建立邀請失敗",
        });
      }
    }),

  list: admin.query(async ({ ctx }) => {
    return ctx.prisma.invitation.findMany({
      where: { companyId: ctx.session.activeCompanyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        inviter: { select: { name: true, email: true } },
      },
    });
  }),
});
