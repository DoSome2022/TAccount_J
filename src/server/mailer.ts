/**
 * 郵件寄送（nodemailer）：
 *  - 設定 SMTP_HOST 等環境變數 → 寄真實郵件
 *  - 未設定 → 開發模式：連結印到伺服器 console 並回傳 devLink 供頁面直接顯示
 */
import nodemailer from "nodemailer";

export type SendResult = { sent: boolean; devLink?: string };

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3001";
}

export async function sendPasswordResetEmail(
  to: string,
  link: string,
): Promise<SendResult> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`\n[mailer-dev] 密碼重設連結（${to}）:\n  ${link}\n`);
    return { sent: false, devLink: link };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM ?? `"TAccounts" <no-reply@${host}>`,
    to,
    subject: "TAccounts 密碼重設",
    text: [
      "我們收到你的密碼重設請求。",
      "",
      `請於 1 小時內點擊以下連結設定新密碼（一次性）：`,
      link,
      "",
      "如果你沒有提出此請求，請忽略這封信，你的密碼不會變更。",
      "",
      "— TAccounts",
    ].join("\n"),
  });
  return { sent: true };
}
