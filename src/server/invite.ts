/**
 * Admin 邀請制（鐵律：無公開註冊）
 *  - Token 由伺服器 HMAC-SHA256 簽署（payload 含邀請 id、email、到期時間）
 *  - 資料庫只存 token 的 SHA-256（DB 洩漏也無法偽造/重放連結）
 *  - 驗證時先驗簽章與時效，再查 DB 狀態（未接受、未過期）
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import type { Role } from "@/generated/prisma/enums";

const SECRET = () => {
  const s = process.env.INVITE_SECRET;
  if (!s) throw new Error("缺少 INVITE_SECRET 環境變數");
  return s;
};

export type InvitePayload = {
  id: string;
  email: string;
  exp: number; // epoch ms
};

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signInviteToken(p: InvitePayload): string {
  const body = b64url(JSON.stringify(p));
  const sig = createHmac("sha256", SECRET()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyInviteToken(token: string): InvitePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SECRET()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // timing-safe 比較，防簽章側信道
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InvitePayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** ADMIN/OWNER 建立邀請，回傳僅此一次可用的邀請連結 */
export async function createInvitation(input: {
  companyId: string;
  email: string;
  role: Role;
  invitedById: string;
  ip?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const existing = await prisma.userCompany.findFirst({
    where: { companyId: input.companyId, user: { email: input.email } },
  });
  if (existing) throw new Error("該使用者已是本公司的成員");

  const invitation = await prisma.invitation.create({
    data: {
      email: input.email.toLowerCase(),
      companyId: input.companyId,
      role: input.role,
      tokenHash: "pending", // 先佔位，簽完 token 再回填
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 天有效
      invitedBy: input.invitedById,
    },
  });

  const token = signInviteToken({
    id: invitation.id,
    email: input.email.toLowerCase(),
    exp: invitation.expiresAt.getTime(),
  });
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { tokenHash: hashToken(token) },
  });

  await prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.invitedById,
      action: "INVITE_CREATE",
      entity: "Invitation",
      entityId: invitation.id,
      details: { email: input.email, role: input.role },
      ip: input.ip,
    },
  });

  return { token, expiresAt: invitation.expiresAt };
}

export type InviteCheck =
  | { ok: true; email: string; companyName: string; companyId: string; role: Role; userExists: boolean; invitationId: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "ACCEPTED" };

/** 驗證邀請（供 /invite/[token] 頁面與 accept API 使用） */
export async function checkInvitation(token: string): Promise<InviteCheck> {
  const payload = verifyInviteToken(token);
  if (!payload) return { ok: false, reason: "INVALID" };

  const invitation = await prisma.invitation.findUnique({
    where: { id: payload.id },
    include: { company: { select: { name: true } } },
  });
  if (!invitation) return { ok: false, reason: "INVALID" };
  if (hashToken(token) !== invitation.tokenHash) return { ok: false, reason: "INVALID" };
  if (invitation.expiresAt.getTime() < Date.now()) return { ok: false, reason: "EXPIRED" };
  if (invitation.acceptedAt) return { ok: false, reason: "ACCEPTED" };

  const user = await prisma.user.findUnique({ where: { email: invitation.email } });
  return {
    ok: true,
    email: invitation.email,
    companyName: invitation.company.name,
    companyId: invitation.companyId,
    role: invitation.role,
    userExists: !!user,
    invitationId: invitation.id,
  };
}

/** 接受邀請：綁定使用者與公司 */
export async function acceptInvitation(
  invitationId: string,
  userId: string,
  ip?: string | null,
): Promise<{ companyId: string; role: Role }> {
  const invitation = await prisma.invitation.findUniqueOrThrow({
    where: { id: invitationId },
  });
  if (invitation.acceptedAt) throw new Error("邀請已被使用");
  if (invitation.expiresAt.getTime() < Date.now()) throw new Error("邀請已過期");

  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId, companyId: invitation.companyId } },
    update: {},
    create: { userId, companyId: invitation.companyId, role: invitation.role },
  });
  await prisma.invitation.update({
    where: { id: invitationId },
    data: { acceptedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      companyId: invitation.companyId,
      userId,
      action: "INVITE_ACCEPT",
      entity: "Invitation",
      entityId: invitationId,
      details: { email: invitation.email, role: invitation.role },
      ip,
    },
  });
  return { companyId: invitation.companyId, role: invitation.role };
}
