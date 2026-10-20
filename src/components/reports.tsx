"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

function fmt(n: unknown): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
}

/** 資產負債表 + 損益表（快照增量模型產出，含會計恆等式驗證） */
export function Reports() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const bs = trpc.ledger.balanceSheet.useQuery({ period });
  const is = trpc.ledger.incomeStatement.useQuery({ period });

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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 資產負債表 */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold mb-4">資產負債表（{bs.data?.period ?? period}）</h2>
          {bs.isLoading ? (
            <p className="text-sm text-slate-500">載入中…</p>
          ) : bs.data ? (
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="font-medium text-slate-600 text-xs mb-1">資產</h3>
                {bs.data.assets.map((a) => (
                  <div key={a.code} className="flex justify-between py-0.5">
                    <span className="text-slate-600">
                      {a.code} {a.name}
                    </span>
                    <span className="font-mono">
                      {Number(a.balance) > 0 ? fmt(a.balance) : ""}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>資產合計</span>
                  <span className="font-mono">{fmt(bs.data.totalAssets)}</span>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-slate-600 text-xs mb-1">負債</h3>
                {bs.data.liabilities.map((a) => (
                  <div key={a.code} className="flex justify-between py-0.5">
                    <span className="text-slate-600">
                      {a.code} {a.name}
                    </span>
                    <span className="font-mono">
                      {Number(a.balance) < 0 ? fmt(Math.abs(Number(a.balance))) : ""}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>負債合計</span>
                  <span className="font-mono">{fmt(Math.abs(Number(bs.data.totalLiabilities)))}</span>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-slate-600 text-xs mb-1">資本</h3>
                {bs.data.equity.map((a) => (
                  <div key={a.code} className="flex justify-between py-0.5">
                    <span className="text-slate-600">
                      {a.code} {a.name}
                    </span>
                    <span className="font-mono">
                      {Number(a.balance) < 0 ? fmt(Math.abs(Number(a.balance))) : ""}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-600">本期損益（累計）</span>
                  <span className="font-mono">
                    {Number(bs.data.netIncome) < 0 ? fmt(Math.abs(Number(bs.data.netIncome))) : ""}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>負債與資本合計</span>
                  <span className="font-mono">
                    {fmt(
                      Math.abs(Number(bs.data.totalLiabilities)) +
                        Math.abs(Number(bs.data.totalEquity)) +
                        Math.abs(Number(bs.data.netIncome)),
                    )}
                  </span>
                </div>
              </div>
              <p
                className={`text-xs rounded-lg px-3 py-2 border ${
                  bs.data.identityHolds
                    ? "text-green-700 bg-green-50 border-green-200"
                    : "text-red-700 bg-red-50 border-red-200"
                }`}
              >
                {bs.data.identityHolds
                  ? "✓ 會計恆等式成立：資產 + 銷貨成本 + 費用 = 負債 + 資本 + 收入"
                  : "✗ 會計恆等式不成立，請立即校驗！"}
              </p>
            </div>
          ) : null}
        </section>

        {/* 損益表 */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold mb-4">損益表（{is.data?.period ?? period} 本期）</h2>
          {is.isLoading ? (
            <p className="text-sm text-slate-500">載入中…</p>
          ) : is.data ? (
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="font-medium text-slate-600 text-xs mb-1">收入</h3>
                {is.data.rows
                  .filter((r) => r.type === "REVENUE")
                  .map((r) => (
                    <div key={r.code} className="flex justify-between py-0.5">
                      <span className="text-slate-600">
                        {r.code} {r.name}
                      </span>
                      <span className="font-mono">{fmt(r.amount)}</span>
                    </div>
                  ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>收入合計</span>
                  <span className="font-mono">{fmt(is.data.revenue)}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">銷貨成本</span>
                <span className="font-mono">{fmt(is.data.cogs)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>毛利</span>
                <span className="font-mono">{fmt(is.data.grossProfit)}</span>
              </div>
              <div>
                <h3 className="font-medium text-slate-600 text-xs mb-1">費用</h3>
                {is.data.rows
                  .filter((r) => r.type === "EXPENSE")
                  .map((r) => (
                    <div key={r.code} className="flex justify-between py-0.5">
                      <span className="text-slate-600">
                        {r.code} {r.name}
                      </span>
                      <span className="font-mono">{fmt(r.amount)}</span>
                    </div>
                  ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>費用合計</span>
                  <span className="font-mono">{fmt(is.data.expenses)}</span>
                </div>
              </div>
              <div
                className={`flex justify-between rounded-lg px-3 py-2 font-bold ${
                  Number(is.data.netIncome) >= 0 ? "bg-green-50" : "bg-red-50"
                }`}
              >
                <span>本期淨利</span>
                <span className="font-mono">{fmt(is.data.netIncome)}</span>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
