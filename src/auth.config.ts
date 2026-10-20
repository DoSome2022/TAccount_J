/**
 * Edge-safe Auth.js 設定（不含 Prisma 依賴）：
 * 供 middleware 於 Edge Runtime 使用；完整設定見 src/auth.ts。
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // 由 auth.ts 補上 Credentials（Prisma 依賴）
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.activeCompanyId =
          (user as { activeCompanyId?: string | null }).activeCompanyId ?? null;
        token.activeRole = (user as { activeRole?: string | null }).activeRole ?? null;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.activeCompanyId = (token.activeCompanyId as string | null) ?? null;
      session.activeRole = (token.activeRole as string | null) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;
