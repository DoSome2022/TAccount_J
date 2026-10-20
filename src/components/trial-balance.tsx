"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";

const TYPE_LABEL: Record<string, string> = {
  ASSET: "資產",
  LIABILITY: "負債",
  EQUITY: "資本",
  REVENUE: "收入",
  COGS: "銷貨成本",
  EXPENSE: "費用",
};

/** 試算表（快照直讀，O(帳戶數)，不掃分錄） */
export function TrialBalance() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const q = trpc.ledger.trialBalance.useQuery({ period });

  const groups = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!m.has(r.type)) m.set(r.type, []);
      m.get(r.type)!.push(r);
    }
    return m;
  }, [q.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">期別</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-slate-400">快照直讀，無全表掃描</span>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : q.error ? (
        <p className="text-sm text-red-600">{q.error.message}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="py-2 px-4">科目代碼</th>
                <th className="py-2 px-4">科目名稱</th>
                <th className="py-2 px-4 text-right">借方餘額</th>
                <th className="py-2 px-4 text-right">貸方餘額</th>
              </tr>
            </thead>
            {[...groups.entries()].map(([type, rows]) => (
              <tbody key={type}>
                <tr className="bg-slate-100/60">
                  <td colSpan={4} className="py-1.5 px-4 font-semibold text-slate-600 text-xs">
                    {TYPE_LABEL[type] ?? type}
                  </td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b border-slate-100">
                    <td className="py-1.5 px-4 font-mono">{r.code}</td>
                    <td className="py-1.5 px-4">{r.name}</td>
                    <td className="py-1.5 px-4 text-right font-mono">
                      {Number(r.debit) > 0 ? Number(r.debit).toFixed(2) : ""}
                    </td>
                    <td className="py-1.5 px-4 text-right font-mono">
                      {Number(r.credit) > 0 ? Number(r.credit).toFixed(2) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            {q.data && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                  <td className="py-2 px-4" colSpan={2}>
                    合計
                    <span
                      className={`ml-3 text-xs font-medium ${
                        q.data.balanced ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {q.data.balanced ? "✓ 平衡" : "✗ 不平衡"}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right font-mono">
                    {Number(q.data.totalDebit).toFixed(2)}
                  </td>
                  <td className="py-2 px-4 text-right font-mono">
                    {Number(q.data.totalCredit).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
