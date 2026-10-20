/**
 * 密碼重設 Token（Email 找回密碼）：
 *  - 與邀請制同款 HMAC-SHA256 簽章：payload 含 id/uid/exp
 *  - DB 只存 SHA-256（洩庫無法偽造）
 *  - 一次性（usedAt）、限時（1 小時）
 */
import { createHash, createHmac } from "node:crypto";
import { prisma } from "@/server/db";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 小時

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("缺少 AUTH_SECRET 環境變數");
  return s;
}

type ResetPayload = { id: string; uid: string; exp: number };

function sign(p: ResetPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySignature(token: string): ResetPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ResetPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 建立重設 token（先寫 DB 佔位再回填 hash，與邀請制一致） */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const row = await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: "pending",
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  const token = sign({ id: row.id, uid: userId, exp: row.expiresAt.getTime() });
  await prisma.passwordResetToken.update({
    where: { id: row.id },
    data: { tokenHash: hashToken(token) },
  });
  return token;
}

export type ResetCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" };

/** 供重設頁面顯示狀態（不消耗 token） */
export async function checkPasswordResetToken(token: string): Promise<ResetCheck> {
  const payload = verifySignature(token);
  if (!payload) return { ok: false, reason: "INVALID" };
  const row = await prisma.passwordResetToken.findUnique({
    where: { id: payload.id },
    include: { user: { select: { email: true } } },
  });
  if (!row || row.tokenHash !== hashToken(token)) return { ok: false, reason: "INVALID" };
  if (row.usedAt) return { ok: false, reason: "USED" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, email: row.user.email };
}

/**
 * 使用 token 重設密碼（原子消耗：updateMany where usedAt=null 防重放）
 * 回傳 null 代表 token 無效/過期/已用。
 */
export async function consumePasswordResetToken(
  token: string,
  newPasswordHash: string,
  ip?: string | null,
): Promise<{ userId: string } | null> {
  const payload = verifySignature(token);
  if (!payload) return null;

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { id: payload.id } });
    if (!row || row.tokenHash !== hashToken(token)) return null;
    if (row.usedAt) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;

    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return null; // 並發重放防護

    await tx.user.update({
      where: { id: payload.uid },
      data: { passwordHash: newPasswordHash },
    });

    // 審計（帳號層事件，companyId 為空）
    await tx.auditLog.create({
      data: {
        companyId: null,
        userId: payload.uid,
        action: "PASSWORD_RESET",
        entity: "User",
        entityId: payload.uid,
        details: { via: "email-reset-token" },
        ip,
      },
    });
    return { userId: payload.uid };
  });
  return result;
}
