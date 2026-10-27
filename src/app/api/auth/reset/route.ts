/**
 * 重設密碼 API：驗證一次性 token → bcrypt 更新密碼 → 寫 audit_log
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { consumePasswordResetToken } from "@/server/password-reset";
import { rateLimit } from "@/server/rate-limit";

const MAX_ATTEMPTS = 10;
const WINDOW_SEC = 15 * 60;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  // 速率限制（Redis 分散式／記憶體 fallback）：IP 15 分鐘內最多 10 次
  const limit = await rateLimit(`reset:${ip}`, MAX_ATTEMPTS, WINDOW_SEC);
  if (!limit.ok) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (password.length < 8 || password.length > 100) {
    return NextResponse.json({ code: "WEAK_PASSWORD", message: "密碼至少 8 位" }, { status: 400 });
  }

  const result = await consumePasswordResetToken(
    token,
    await bcrypt.hash(password, 12),
    ip,
  );
  if (!result) {
    return NextResponse.json(
      { code: "BAD_TOKEN", message: "連結無效、已過期或已被使用，請重新申請" },
      { status: 410 },
    );
  }
  return NextResponse.json({ ok: true, message: "密碼已更新，請用新密碼登入" });
}
