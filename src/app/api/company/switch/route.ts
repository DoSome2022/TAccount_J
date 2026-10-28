/**
 * 多租戶公司切換：驗證成員身份後重新簽署 session JWT，
 * 將 activeCompanyId / activeRole 寫入 token（Tenant Isolation）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { encode } from "next-auth/jwt";
import { prisma } from "@/server/db";

/**
 * 與 Auth.js 相同的安全 Cookie 判斷：
 * Auth.js 以 request URL 的 protocol 決定是否加 __Secure- 前綴，
 * 而 next-auth 在 AUTH_URL 有值時會用 AUTH_URL 覆寫 request URL。
 */
function isSecureSessionCookie(req: NextRequest): boolean {
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (authUrl) {
    try {
      return new URL(authUrl).protocol === "https:";
    } catch {
      // 無效 URL：退回請求判斷
    }
  }
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return req.nextUrl.protocol === "https:" || forwardedProto === "https";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companyId = String(body.companyId ?? "");

  // Cookie 名稱必須與 Auth.js 完全一致（HTTPS 下為 __Secure-authjs.session-token）
  const secureCookie = isSecureSessionCookie(req);
  const cookieName = `${secureCookie ? "__Secure-" : ""}authjs.session-token`;

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie,
    cookieName,
  });
  if (!token?.uid) return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });

  // Tenant Isolation：必須是該公司成員才能切換
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: token.uid as string, companyId } },
    include: { user: { select: { isFrozen: true } }, company: { select: { subscriptionStatus: true } } },
  });
  if (!membership) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  // 凍結用戶不得切換公司
  if (membership.user.isFrozen) {
    return NextResponse.json({ code: "ACCOUNT_FROZEN", message: "帳號已被凍結" }, { status: 403 });
  }
  // 非 OWNER 不得切到訂閱未生效的公司
  if (membership.role !== "OWNER" && membership.company.subscriptionStatus !== "ACTIVE") {
    return NextResponse.json(
      { code: "SUBSCRIPTION_INACTIVE", message: "公司訂閱未生效" },
      { status: 403 },
    );
  }

  const updated = await encode({
    secret: process.env.AUTH_SECRET as string,
    // Auth.js 以 session cookie 名稱作為 HKDF salt（非 AUTH_SECRET），
    // salt 不一致會讓 Auth.js 無法解碼重新簽署的 token
    salt: cookieName,
    token: {
      ...token,
      activeCompanyId: companyId,
      activeRole: membership.role,
    },
    maxAge: 30 * 24 * 3600,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, updated, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // __Secure- 前綴要求 Secure flag；NODE_ENV=production 時兩者同步啟用
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
