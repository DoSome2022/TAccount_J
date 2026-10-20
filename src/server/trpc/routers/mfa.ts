/**
 * MFA（TOTP）設定 router：
 *  - beginEnable：驗證密碼 → 產生 secret（明文字串只回傳一次，DB 只存密文）
 *  - confirmEnable：驗證 TOTP → 加密儲存並啟用
 *  - disable：需密碼 + 現行 TOTP 雙重驗證
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { router } from "@/server/trpc/init";
import { authed } from "@/server/trpc/procedures";
import { generateTotpSecret, verifyTotp, totpUri } from "@/server/totp";
import { encryptMfaSecret } from "@/server/mfa-enc";

async function verifyPassword(ctx: Parameters<Parameters<typeof authed.mutation>[0]>[0]["ctx"], password: string) {
  const user = await ctx.prisma.user.findUniqueOrThrow({
    where: { id: ctx.session.user.id },
    select: { passwordHash: true },
  });
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "密碼錯誤" });
  }
}

export const mfaRouter = router({
  status: authed.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { mfaEnabled: true, mfaEnabledAt: true },
    });
    return user;
  }),

  beginEnable: authed
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await verifyPassword(ctx, input.password);
      const secret = generateTotpSecret();
      return {
        secret,
        uri: totpUri(secret, ctx.session.user.email ?? ctx.session.user.id),
      };
    }),

  confirmEnable: authed
    .input(
      z.object({
        secret: z.string().min(16),
        totp: z.string().regex(/^\d{6}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!verifyTotp(input.secret, input.totp)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "驗證碼錯誤，請確認驗證器時間同步" });
      }
      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          mfaEnabled: true,
          mfaEnabledAt: new Date(),
          mfaSecretEnc: JSON.stringify(encryptMfaSecret(input.secret)),
        },
      });
      return { ok: true };
    }),

  disable: authed
    .input(
      z.object({
        password: z.string().min(1),
        totp: z.string().regex(/^\d{6}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyPassword(ctx, input.password);
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: ctx.session.user.id },
        select: { mfaSecretEnc: true },
      });
      if (!user.mfaSecretEnc) throw new TRPCError({ code: "BAD_REQUEST", message: "尚未啟用 MFA" });
      const { decryptMfaSecret } = await import("@/server/mfa-enc");
      const secret = decryptMfaSecret(JSON.parse(user.mfaSecretEnc));
      if (!verifyTotp(secret, input.totp)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "驗證碼錯誤" });
      }
      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { mfaEnabled: false, mfaEnabledAt: null, mfaSecretEnc: null },
      });
      return { ok: true };
    }),
});
