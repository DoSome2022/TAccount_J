"use client";

/**
 * Admin 邀請管理（鐵律：無公開註冊，僅 ADMIN 可發邀請；OWNER 無邀請功能）
 * 邀請連結只顯示一次：token 在 DB 只存 SHA-256 hash，無法事後重建。
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const ROLES = [
  { value: "ACCOUNTANT", label: "會計" },
  { value: "ADMIN", label: "管理員" },
  { value: "VIEWER", label: "唯讀" },
  { value: "OWNER", label: "擁有者" },
];

export function InvitesManager() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ACCOUNTANT");
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listQ = trpc.invite.list.useQuery();
  const createM = trpc.invite.create.useMutation();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await createM.mutateAsync({ email, role: role as never });
      setCreatedLink(r.link);
      setEmail("");
      listQ.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold">發送邀請</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="new-user@company.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={createM.isPending}
          className="rounded-lg bg-blue-600 text-white px-5 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          產生邀請連結（7 天有效）
        </button>
        {createdLink && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-800">
              ⚠️ 此連結只顯示一次，請立即複製給受邀者：
            </p>
            <p className="font-mono text-xs break-all bg-white rounded p-2 border border-amber-200">
              {typeof window !== "undefined" ? `${window.location.origin}${createdLink}` : createdLink}
            </p>
          </div>
        )}
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h2 className="font-semibold px-6 pt-5">邀請紀錄</h2>
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="py-2 px-6">Email</th>
              <th className="py-2 px-4">角色</th>
              <th className="py-2 px-4">發送者</th>
              <th className="py-2 px-4">建立時間</th>
              <th className="py-2 px-4">有效至</th>
              <th className="py-2 px-4">狀態</th>
            </tr>
          </thead>
          <tbody>
            {(listQ.data ?? []).map((inv) => (
              <tr key={inv.id} className="border-b border-slate-100">
                <td className="py-2 px-6">{inv.email}</td>
                <td className="py-2 px-4">{inv.role}</td>
                <td className="py-2 px-4 text-slate-500">{inv.inviter.name ?? inv.inviter.email}</td>
                <td className="py-2 px-4 text-slate-500">{new Date(inv.createdAt).toLocaleString()}</td>
                <td className="py-2 px-4 text-slate-500">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                <td className="py-2 px-4">
                  {inv.acceptedAt ? (
                    <span className="text-green-600">已接受</span>
                  ) : inv.expiresAt.getTime() < Date.now() ? (
                    <span className="text-red-500">已過期</span>
                  ) : (
                    <span className="text-amber-600">待接受</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
