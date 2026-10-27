import { connection } from "next/server";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { InvitesManager } from "@/components/invites-manager";

export const metadata = { title: "成員邀請 — TAccounts" };
export const instant = false;

export default async function InvitesPage() {
  await connection(); // Auth.js 初始化含 crypto.getRandomValues，需於請求時渲染
  const session = await auth();
  // 邀請僅 ADMIN（OWNER 無邀請功能）
  if (!session || session.activeRole !== "ADMIN") {
    redirect("/dashboard");
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">成員邀請（Admin 邀請制）</h1>
      <InvitesManager />
    </div>
  );
}
