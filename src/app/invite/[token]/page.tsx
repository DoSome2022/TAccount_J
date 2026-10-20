import { connection } from "next/server";
import { checkInvitation } from "@/server/invite";
import { InviteAccept } from "@/components/invite-accept";

export const metadata = { title: "接受邀請 — TAccounts" };
export const instant = false; // 依賴路由 params 與 DB 查詢

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection(); // DB 查詢需於請求時渲染
  const { token } = await params;
  const check = await checkInvitation(token);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">TAccounts 邀請</h1>
        <InviteAccept token={token} check={check} />
      </div>
    </main>
  );
}
