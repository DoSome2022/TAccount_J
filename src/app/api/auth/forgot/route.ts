/**
 * 忘記密碼 API：
 *  - 回應一律相同（不洩漏信箱是否存在，防帳號列舉）
 *  - 開發模式（未設 SMTP）回傳 devLink 供頁面顯示
 *  - 速率限制：IP 15 分鐘內最多 5 次
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { createPasswordResetToken } from "@/server/password-reset";
import { sendPasswordResetEmail, appUrl } from "@/server/mailer";
import { rateLimit } from "@/server/rate-limit";

const MAX_ATTEMPTS = 5;
const WINDOW_SEC = 15 * 60;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  // 速率限制（Redis 分散式／記憶體 fallback）：IP 15 分鐘內最多 5 次
  const limit = await rateLimit(`forgot:${ip}`, MAX_ATTEMPTS, WINDOW_SEC);
  if (!limit.ok) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").toLowerCase().trim();

  // 統一成功回應（無論信箱是否存在）
  const base = { ok: true, message: "如果此信箱存在於系統中，重設連結已寄出（1 小時內有效）" };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ code: "INVALID_EMAIL", message: "Email 格式錯誤" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    try {
      const token = await createPasswordResetToken(user.id);
      const link = `${appUrl(req.nextUrl.origin)}/reset-password/${token}`;
      const r = await sendPasswordResetEmail(user.email, link);
      return NextResponse.json({ ...base, devLink: r.devLink });
    } catch (e) {
      // 寄信失敗不洩漏細節，僅記錄伺服器日誌
      console.error("[forgot-password] 寄信失敗:", e);
      return NextResponse.json(base);
    }
  }

  // 無此信箱：照常回覆（防列舉），略做延遲拉平時序
  await new Promise((r) => setTimeout(r, 200));
  return NextResponse.json(base);
}
