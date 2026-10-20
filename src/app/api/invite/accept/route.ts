/**
 * 接受邀請 API：
 *  - 已登入且信箱相符 → 直接綁定公司
 *  - 使用者已存在但未登入 → 409 LOGIN_REQUIRED（前端導向登入）
 *  - 全新使用者 → 建立帳號（bcrypt 密碼）+ 綁定
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { acceptInvitation, checkInvitation } from "@/server/invite";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");

  const check = await checkInvitation(token);
  if (!check.ok) {
    return NextResponse.json(
      { code: check.reason },
      { status: check.reason === "EXPIRED" ? 410 : check.reason === "ACCEPTED" ? 409 : 400 },
    );
  }

  const session = await auth();
  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";

  // 已登入：必須是受邀信箱本人
  if (session?.user?.email?.toLowerCase() === check.email.toLowerCase()) {
    const r = await acceptInvitation(check.invitationId, session.user.id, ip);
    return NextResponse.json({ ok: true, companyId: r.companyId });
  }

  // 使用者已存在但未登入
  if (check.userExists) {
    return NextResponse.json({ code: "LOGIN_REQUIRED" }, { status: 409 });
  }

  // 全新使用者：建立帳號
  if (!name || password.length < 8) {
    return NextResponse.json(
      { code: "WEAK_INPUT", message: "請提供姓名與至少 8 位密碼" },
      { status: 400 },
    );
  }
  const user = await prisma.user.create({
    data: {
      email: check.email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerified: new Date(),
    },
  });
  const r = await acceptInvitation(check.invitationId, user.id, ip);
  return NextResponse.json({ ok: true, companyId: r.companyId });
}
