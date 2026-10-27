"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "擁有者",
  ADMIN: "管理員",
  ACCOUNTANT: "會計",
  VIEWER: "唯讀",
};

/** 用戶管理：凍結／解凍公司成員（凍結者無法登入，即時生效） */
export function UsersManager() {
  const q = trpc.user.listMembers.useQuery();
  const setFrozenM = trpc.user.setFrozen.useMutation();
  const [error, setError] = useState<string | null>(null);

  async function toggle(userId: string, frozen: boolean, email: string) {
    setError(null);
    if (!confirm(frozen ? `確定凍結 ${email}？凍結後該用戶將無法登入。` : `確定解凍 ${email}？`)) {
      return;
    }
    try {
      await setFrozenM.mutateAsync({ userId, frozen });
      q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    }
  }

  if (q.isLoading) return <p className="text-sm text-slate-500">載入中…</p>;
  if (q.error) return <p className="text-sm text-red-600">{q.error.message}</p>;

  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="py-2 px-6">Email</th>
              <th className="py-2 px-4">名稱</th>
              <th className="py-2 px-4">角色</th>
              <th className="py-2 px-4">狀態</th>
              <th className="py-2 px-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.userId} className="border-b border-slate-100">
                <td className="py-2 px-6">{m.email}</td>
                <td className="py-2 px-4 text-slate-500">{m.name ?? "—"}</td>
                <td className="py-2 px-4">{ROLE_LABEL[m.role] ?? m.role}</td>
                <td className="py-2 px-4">
                  {m.isFrozen ? (
                    <span className="text-xs text-red-600 border border-red-200 rounded px-1.5 py-0.5">
                      已凍結
                    </span>
                  ) : (
                    <span className="text-xs text-green-600 border border-green-200 rounded px-1.5 py-0.5">
                      正常
                    </span>
                  )}
                </td>
                <td className="py-2 px-4 text-right">
                  <button
                    disabled={setFrozenM.isPending}
                    onClick={() => toggle(m.userId, !m.isFrozen, m.email)}
                    className={`text-xs hover:underline disabled:opacity-40 ${
                      m.isFrozen ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {m.isFrozen ? "解凍" : "凍結"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        凍結後該用戶將立即無法登入（含已登入的連線）；不能凍結自己，ADMIN 不能凍結 OWNER。
      </p>
    </div>
  );
}
