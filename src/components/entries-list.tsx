"use client";

import { Fragment, useState } from "react";
import { trpc } from "@/lib/trpc/client";

export function EntriesList({ isAdmin }: { isAdmin: boolean }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const q = trpc.journal.list.useQuery({ page, pageSize });
  const voidMutation = trpc.journal.void.useMutation();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (q.isLoading) return <p className="text-slate-500 text-sm">載入中…</p>;
  if (q.error) return <p className="text-red-600 text-sm">{q.error.message}</p>;
  if (!q.data) return null;

  const { entries, total } = q.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">共 {total} 筆正式分錄（已鏈入防竄改雜湊鏈）</p>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="py-2 px-4">#</th>
              <th className="py-2 px-4">日期</th>
              <th className="py-2 px-4">摘要</th>
              <th className="py-2 px-4 text-right">金額</th>
              <th className="py-2 px-4">建立者</th>
              <th className="py-2 px-4">Hash</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const amount = e.lines
                .reduce((s, l) => s + Number(l.debit), 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2 });
              return (
                <Fragment key={e.id}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-4 font-mono">{String(e.entryNo).padStart(3, "0")}</td>
                    <td className="py-2 px-4">
                      {typeof e.entryDate === "string"
                        ? e.entryDate
                        : new Date(e.entryDate).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4">
                      {e.description}
                      {e.status === "VOID" && (
                        <span className="ml-2 text-xs text-red-600 border border-red-200 rounded px-1">
                          已作廢
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right font-mono">{amount}</td>
                    <td className="py-2 px-4 text-slate-500">{e.createdBy.name ?? e.createdBy.email}</td>
                    <td className="py-2 px-4 font-mono text-xs text-slate-500">{e.hash.slice(0, 12)}…</td>
                    <td className="py-2 px-4 space-x-2">
                      <button
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        {expanded === e.id ? "收合" : "明細"}
                      </button>
                      {isAdmin && e.status !== "VOID" && (
                        <button
                          disabled={voidMutation.isPending}
                          onClick={() => {
                            if (confirm(`確定作廢分錄 #${e.entryNo}？歷史 hash 鏈不變，快照將回沖。`)) {
                              voidMutation.mutateAsync({ entryId: e.id }).then(() => q.refetch());
                            }
                          }}
                          className="text-red-500 hover:underline text-xs"
                        >
                          作廢
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-6 py-3">
                        <table className="w-full text-xs">
                          <tbody>
                            {e.lines.map((l) => (
                              <tr key={l.id} className="border-b border-slate-100">
                                <td className="py-1 w-24 font-mono">{l.accountCode}</td>
                                <td className="py-1 w-48">{l.account.name}</td>
                                <td className="py-1 text-right w-40 font-mono">
                                  {Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ""}
                                </td>
                                <td className="py-1 text-right w-40 font-mono">
                                  {Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-2 font-mono text-[10px] text-slate-400 break-all">
                          prev: {e.prevHash} → hash: {e.hash}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          上一頁
        </button>
        <span className="text-slate-500">
          {page} / {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          下一頁
        </button>
      </div>
    </div>
  );
}
