"use client";

import { useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export function DashboardOverview() {
  const period = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const tb = trpc.ledger.trialBalance.useQuery({ period });
  const entries = trpc.journal.list.useQuery({ page: 1, pageSize: 5 });
  const verify = trpc.ledger.verifyChain.useQuery(undefined, { refetchInterval: 0 });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">試算表概覽（{period}）</h2>
          <Link href="/dashboard/ledger" className="text-sm text-blue-600 hover:underline">
            完整試算表 →
          </Link>
        </div>
        {tb.isLoading ? (
          <p className="text-sm text-slate-500">載入中…</p>
        ) : tb.data ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">借方合計</span>
              <span className="font-mono font-semibold">
                {Number(tb.data.totalDebit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">貸方合計</span>
              <span className="font-mono font-semibold">
                {Number(tb.data.totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-500">平衡狀態</span>
              <span className={tb.data.balanced ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                {tb.data.balanced ? "✓ 平衡" : "✗ 不平衡"}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">防竄改雜湊鏈</h2>
          <Link href="/dashboard/verify" className="text-sm text-blue-600 hover:underline">
            完整校驗 →
          </Link>
        </div>
        {verify.isLoading ? (
          <p className="text-sm text-slate-500">校驗中…</p>
        ) : verify.data ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">已鏈接分錄</span>
              <span className="font-mono">{verify.data.checked} 筆</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">創世區塊</span>
              <span className="font-mono text-xs text-slate-400">
                {verify.data.genesisHash.slice(0, 16)}…
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-500">完整性</span>
              <span className={verify.data.ok ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                {verify.data.ok ? "✓ 鏈完整，無竄改" : `✗ 斷裂 ${verify.data.broken.length} 處！`}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">最近分錄</h2>
          <div className="space-x-3">
            <Link href="/dashboard/entries/new" className="text-sm text-blue-600 hover:underline">
              新增分錄 →
            </Link>
            <Link href="/dashboard/entries" className="text-sm text-blue-600 hover:underline">
              全部 →
            </Link>
          </div>
        </div>
        {entries.data && entries.data.entries.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {entries.data.entries.map((e) => (
              <li key={e.id} className="py-2 flex justify-between">
                <span className="font-mono text-slate-500">#{String(e.entryNo).padStart(3, "0")}</span>
                <span className="flex-1 px-4">{e.description}</span>
                <span className="text-slate-500">
                  {typeof e.entryDate === "string" ? e.entryDate : new Date(e.entryDate).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">尚無分錄。</p>
        )}
      </section>
    </div>
  );
}
