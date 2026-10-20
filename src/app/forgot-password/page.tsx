import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "忘記密碼 — TAccounts" };

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">忘記密碼</h1>
          <p className="text-sm text-slate-500 mt-1">透過 Email 重設密碼</p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
