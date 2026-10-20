import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const metadata = { title: "登入 — TAccounts" };
export const instant = false; // auth() 讀取 cookies，需動態渲染

export default async function LoginPage() {
  await connection(); // Auth.js 初始化含 crypto.getRandomValues，需於請求時渲染
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">TAccounts</h1>
          <p className="text-sm text-slate-500 mt-1">企業級會計系統 · 僅限受邀成員登入</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
