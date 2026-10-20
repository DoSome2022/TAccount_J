"use client";

import { trpc } from "@/lib/trpc/client";

/** 審計日誌（鐵律：所有關鍵異動皆寫入 audit_log 且不可刪除） */
export function AuditList() {
  const q = trpc.audit.list.useQuery({ limit: 100 });

  if (q.isLoading) return <p className="text-sm text-slate-500">載入中…</p>;
  if (q.error) return <p className="text-sm text-red-600">{q.error.message}</p>;

  const logs = q.data ?? [];
  if (logs.length === 0) return <p className="text-sm text-slate-500">尚無紀錄。</p>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="py-2 px-4">時間</th>
            <th className="py-2 px-4">使用者</th>
            <th className="py-2 px-4">動作</th>
            <th className="py-2 px-4">對象</th>
            <th className="py-2 px-4">IP</th>
            <th className="py-2 px-4">明細</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="py-2 px-4 text-slate-500 whitespace-nowrap">
                {new Date(l.createdAt).toLocaleString()}
              </td>
              <td className="py-2 px-4">{l.user.name ?? l.user.email}</td>
              <td className="py-2 px-4 font-mono text-xs">{l.action}</td>
              <td className="py-2 px-4 text-slate-500">
                {l.entity}
                {l.entityId ? `:${l.entityId.slice(0, 8)}…` : ""}
              </td>
              <td className="py-2 px-4 text-slate-500 font-mono text-xs">{l.ip}</td>
              <td className="py-2 px-4 font-mono text-xs text-slate-500 max-w-64 truncate">
                {JSON.stringify(l.details)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
