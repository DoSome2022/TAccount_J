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

/** 試算表：逐筆交易檢視（每筆分錄顯示借/貸對應科目），科目彙總收合於下方 */
export function TrialBalance() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const q = trpc.ledger.entriesByPeriod.useQuery({ period });
  const summary = trpc.ledger.trialBalance.useQuery({ period });

  const entries = q.data?.entries;
  const totals = useMemo(() => {
    const posted = (entries ?? []).filter((e) => e.status === "POSTED");
    return {
      totalDebit: posted.reduce((s, e) => s + e.lines.reduce((x, l) => x + Number(l.debit), 0), 0),
      totalCredit: posted.reduce((s, e) => s + e.lines.reduce((x, l) => x + Number(l.credit), 0), 0),
    };
  }, [entries]);
  const balanced = totals.totalDebit === totals.totalCredit;

  const groups = useMemo(() => {
    const rows = summary.data?.rows ?? [];
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!m.has(r.type)) m.set(r.type, []);
      m.get(r.type)!.push(r);
    }
    return m;
  }, [summary.data]);

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
        <span className="text-xs text-slate-400">逐筆交易（單期索引查詢，無全表掃描）</span>
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
            {!entries || entries.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={4} className="py-6 px-4 text-center text-slate-400">
                    本期無分錄
                  </td>
                </tr>
              </tbody>
            ) : (
              entries.map((e) => {
                const isVoid = e.status === "VOID";
                const debitLines = e.lines.filter((l) => Number(l.debit) > 0);
                const creditLines = e.lines.filter((l) => Number(l.credit) > 0);
                return (
                  <tbody key={e.entryNo}>
                    {/* 交易標頭列 */}
                    <tr className="bg-slate-100/60">
                      <td
                        colSpan={4}
                        className={`py-1.5 px-4 text-xs font-semibold ${
                          isVoid ? "text-slate-400" : "text-slate-600"
                        }`}
                      >
                        #{String(e.entryNo).padStart(3, "0")} ·{" "}
                        {typeof e.entryDate === "string"
                          ? e.entryDate
                          : new Date(e.entryDate).toLocaleDateString()}{" "}
                        · {e.description}
                        {isVoid && (
                          <span className="ml-2 text-red-500 border border-red-200 rounded px-1 font-normal">
                            已作廢（不計入合計）
                          </span>
                        )}
                      </td>
                    </tr>
                    {debitLines.map((l) => (
                      <tr key={l.accountCode} className={`border-b border-slate-100 ${isVoid ? "text-slate-400" : ""}`}>
                        <td className="py-1.5 px-4 font-mono">{l.accountCode}</td>
                        <td className="py-1.5 px-4">{l.account.name}</td>
                        <td className="py-1.5 px-4 text-right font-mono">
                          {Number(l.debit).toFixed(2)}
                        </td>
                        <td className="py-1.5 px-4 text-right font-mono"></td>
                      </tr>
                    ))}
                    {creditLines.map((l) => (
                      <tr key={l.accountCode} className={`border-b border-slate-100 ${isVoid ? "text-slate-400" : ""}`}>
                        <td className="py-1.5 px-4 font-mono">{l.accountCode}</td>
                        <td className="py-1.5 px-4">{l.account.name}</td>
                        <td className="py-1.5 px-4 text-right font-mono"></td>
                        <td className="py-1.5 px-4 text-right font-mono">
                          {Number(l.credit).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })
            )}
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                <td className="py-2 px-4" colSpan={2}>
                  合計
                  <span
                    className={`ml-3 text-xs font-medium ${
                      balanced ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {balanced ? "✓ 平衡" : "✗ 不平衡"}
                  </span>
                </td>
                <td className="py-2 px-4 text-right font-mono">{totals.totalDebit.toFixed(2)}</td>
                <td className="py-2 px-4 text-right font-mono">{totals.totalCredit.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 科目彙總（截至本期累計餘額） */}
      <details className="bg-white rounded-xl border border-slate-200">
        <summary className="px-6 py-3 text-sm font-semibold cursor-pointer select-none">
          科目彙總（截至本期累計餘額）
        </summary>
        <div className="px-6 pb-4">
          {summary.isLoading ? (
            <p className="text-sm text-slate-500">載入中…</p>
          ) : summary.error ? (
            <p className="text-sm text-red-600">{summary.error.message}</p>
          ) : (
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
              {summary.data && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                    <td className="py-2 px-4" colSpan={2}>
                      合計
                      <span
                        className={`ml-3 text-xs font-medium ${
                          summary.data.balanced ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {summary.data.balanced ? "✓ 平衡" : "✗ 不平衡"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right font-mono">
                      {Number(summary.data.totalDebit).toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-right font-mono">
                      {Number(summary.data.totalCredit).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </details>
    </div>
  );
}
