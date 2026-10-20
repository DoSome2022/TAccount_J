/**
 * 多租戶 Middleware（Edge Runtime — 僅使用 edge-safe authConfig）：
 *  - 未登入 → 導向 /login
 *  - /dashboard/* 與 /api/trpc/* 受保護
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = ["/dashboard", "/api/trpc"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const session = req.auth;

  if (isProtected && !session) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(loginUrl);
  }

  // 已登入但未綁定公司 → 導向選擇公司頁
  if (
    isProtected &&
    session &&
    !session.activeCompanyId &&
    !pathname.startsWith("/dashboard/select-company")
  ) {
    return Response.redirect(new URL("/dashboard/select-company", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/api/trpc/:path*"],
};
