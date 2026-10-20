import { connection } from "next/server";
import { auth } from "@/auth";
import { EntriesList } from "@/components/entries-list";

export const metadata = { title: "分錄列表 — TAccounts" };
export const instant = false;

export default async function EntriesPage() {
  await connection(); // Auth.js 初始化含 crypto.getRandomValues，需於請求時渲染
  const session = await auth();
  const isAdmin = session?.activeRole === "ADMIN" || session?.activeRole === "OWNER";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">分錄列表</h1>
      <EntriesList isAdmin={isAdmin} />
    </div>
  );
}
