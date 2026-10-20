import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/server/db";
import { SetupForm } from "@/components/setup-form";

export const metadata = { title: "首次安裝 — TAccounts" };
export const instant = false;

export default async function SetupPage() {
  await connection();
  // 一次性：系統已有任何使用者即永久關閉安裝頁
  const userCount = await prisma.user.count();
  if (userCount > 0) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">TAccounts 首次安裝</h1>
          <p className="text-sm text-slate-500 mt-1">一次性設定 · 完成後永久關閉</p>
        </div>
        <SetupForm requiresToken={!!process.env.SETUP_TOKEN} />
      </div>
    </main>
  );
}
