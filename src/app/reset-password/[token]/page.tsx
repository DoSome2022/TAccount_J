import Link from "next/link";
import { connection } from "next/server";
import { checkPasswordResetToken } from "@/server/password-reset";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "重設密碼 — TAccounts" };
export const instant = false;

const REASON_TEXT: Record<string, string> = {
  INVALID: "重設連結無效",
  EXPIRED: "重設連結已過期（有效時間 1 小時），請重新申請",
  USED: "重設連結已被使用（一次性），請重新申請",
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;
  const check = await checkPasswordResetToken(token);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">重設密碼</h1>
        </div>
        {check.ok ? (
          <ResetPasswordForm token={token} email={check.email} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-600">{REASON_TEXT[check.reason]}</p>
            <Link
              href="/forgot-password"
              className="inline-block rounded-lg bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700"
            >
              重新申請
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
