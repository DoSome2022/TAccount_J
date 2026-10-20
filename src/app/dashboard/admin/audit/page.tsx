import { connection } from "next/server";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AuditList } from "@/components/audit-list";

export const metadata = { title: "審計日誌 — TAccounts" };
export const instant = false;

export default async function AuditPage() {
  await connection(); // Auth.js 初始化含 crypto.getRandomValues，需於請求時渲染
  const session = await auth();
  if (!session || (session.activeRole !== "ADMIN" && session.activeRole !== "OWNER")) {
    redirect("/dashboard");
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">審計日誌（Audit Log）</h1>
      <AuditList />
    </div>
  );
}
