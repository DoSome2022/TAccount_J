/**
 * 多租戶公司切換：驗證成員身份後重新簽署 session JWT，
 * 將 activeCompanyId / activeRole 寫入 token（Tenant Isolation）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { encode } from "next-auth/jwt";
import { prisma } from "@/server/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companyId = String(body.companyId ?? "");

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token?.uid) return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });

  // Tenant Isolation：必須是該公司成員才能切換
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: token.uid as string, companyId } },
  });
  if (!membership) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });

  const updated = await encode({
    secret: process.env.AUTH_SECRET as string,
    salt: process.env.AUTH_SECRET as string,
    token: {
      ...token,
      activeCompanyId: companyId,
      activeRole: membership.role,
    },
    maxAge: 30 * 24 * 3600,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("authjs.session-token", updated, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
