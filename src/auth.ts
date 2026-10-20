/**
 * Auth.js v5 完整設定（Node Runtime）— 關閉公開註冊（無 OAuth、無註冊頁面），
 * 僅 Credentials（信箱 + 密碼 + 可選 TOTP MFA），JWT 策略，
 * session 中攜帶 activeCompanyId 與 activeRole 供多租戶隔離。
 */
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { verifyTotp } from "@/server/totp";
import { decryptMfaSecret } from "@/server/mfa-enc";
import { authConfig } from "@/auth.config";

export class MfaRequiredError extends CredentialsSignin {
  code = "MFA_REQUIRED";
}
export class InvalidTotpError extends CredentialsSignin {
  code = "INVALID_TOTP";
}
export class InvalidCredentialsError extends CredentialsSignin {
  code = "INVALID_CREDENTIALS";
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAt: number }>();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "密碼", type: "password" },
        totp: { label: "MFA 驗證碼" },
      },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        const totpCode = String(creds?.totp ?? "").trim();
        if (!email || !password) throw new InvalidCredentialsError();

        // 簡易速率限制：15 分鐘內同信箱最多 5 次失敗
        const rec = attempts.get(email) ?? { count: 0, firstAt: Date.now() };
        if (Date.now() - rec.firstAt > WINDOW_MS) {
          rec.count = 0;
          rec.firstAt = Date.now();
        }
        if (rec.count >= MAX_ATTEMPTS) throw new InvalidCredentialsError();
        attempts.set(email, rec);

        const user = await prisma.user.findUnique({
          where: { email },
          include: { companies: { orderBy: { company: { createdAt: "asc" } } } },
        });
        if (!user || !user.passwordHash) {
          // 無此使用者也做一次 bcrypt，防時序側信道
          await bcrypt.compare(password, "$2b$12$C6UzMDM.H6dfI/f/IKcEeO6u0Vz7B7zFTwPvA9ZkQ9m1Y2e0a0x0e");
          rec.count++;
          throw new InvalidCredentialsError();
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          rec.count++;
          throw new InvalidCredentialsError();
        }
        attempts.delete(email);

        // MFA 第二因素
        if (user.mfaEnabled) {
          if (!totpCode) throw new MfaRequiredError();
          if (!user.mfaSecretEnc) throw new InvalidTotpError();
          const secret = decryptMfaSecret(JSON.parse(user.mfaSecretEnc));
          if (!verifyTotp(secret, totpCode)) throw new InvalidTotpError();
        }

        const firstCompany = user.companies[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          activeCompanyId: firstCompany?.companyId ?? null,
          activeRole: firstCompany?.role ?? null,
        };
      },
    }),
  ],
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    activeCompanyId: string | null;
    activeRole: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    activeCompanyId?: string | null;
    activeRole?: string | null;
  }
}
