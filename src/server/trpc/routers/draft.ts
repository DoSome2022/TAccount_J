/**
 * 草稿同步 router（雲端備份端）
 * 鐵律：伺服器只收密文（payload 為客戶端 AES-GCM 產物），
 * 伺服器永遠無法解密未確認草稿。
 */
import { z } from "zod";
import { router, procedure } from "@/server/trpc/init";
import { authed } from "@/server/trpc/procedures";

const pushInput = z.object({
  clientDraftId: z.string().uuid(),
  payload: z.object({
    v: z.literal(1),
    iv: z.string(),
    ciphertext: z.string(),
    kdf: z.object({ iterations: z.number(), hash: z.literal("SHA-256") }),
  }),
  updatedAt: z.number().int().min(0), // epoch ms
  deletedAt: z.number().int().min(0).nullable(),
});

export const draftRouter = router({
  /** 下拉：取回該使用者的全部加密草稿（含墓碑） */
  pull: authed.query(async ({ ctx }) => {
    const rows = await ctx.prisma.encryptedDraft.findMany({
      where: { userId: ctx.session.user.id },
      select: {
        clientDraftId: true,
        payload: true,
        clientUpdatedAt: true,
        deletedAt: true,
      },
    });
    return rows.map((r) => ({
      clientDraftId: r.clientDraftId,
      payload: r.payload,
      updatedAt: Number(r.clientUpdatedAt),
      deletedAt: r.deletedAt ? r.deletedAt.getTime() : null,
    }));
  }),

  /** 上推：以 LWW（clientUpdatedAt）合併，payload 原樣儲存 */
  push: authed
    .input(pushInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.encryptedDraft.findUnique({
        where: { userId_clientDraftId: { userId: ctx.session.user.id, clientDraftId: input.clientDraftId } },
      });
      if (existing && existing.clientUpdatedAt >= BigInt(input.updatedAt)) {
        return { ok: true, skipped: true }; // 遠端較新，忽略
      }
      await ctx.prisma.encryptedDraft.upsert({
        where: { userId_clientDraftId: { userId: ctx.session.user.id, clientDraftId: input.clientDraftId } },
        create: {
          userId: ctx.session.user.id,
          clientDraftId: input.clientDraftId,
          payload: input.payload,
          clientUpdatedAt: BigInt(input.updatedAt),
          deletedAt: input.deletedAt ? new Date(input.deletedAt) : null,
        },
        update: {
          payload: input.payload,
          clientUpdatedAt: BigInt(input.updatedAt),
          deletedAt: input.deletedAt ? new Date(input.deletedAt) : null,
        },
      });
      return { ok: true, skipped: false };
    }),
});
