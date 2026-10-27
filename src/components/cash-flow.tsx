"use client";

import { trpc } from "@/lib/trpc/client";

/** 與 reports.tsx 相同格式；不跨檔 import，避免 reports ↔ cash-flow 循環依賴 */
function fmt(n: unknown): string {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
}

type SectionData = {
  rows: { code: string; name: string; amount: unknown }[];
  total: unknown;
};

function AmountSection({
  title,
  totalLabel,
  data,
}: {
  title: string;
  totalLabel: string;
  data: SectionData;
}) {
  return (
    <div>
      <h3 className="font-medium text-slate-600 text-xs mb-1">{title}</h3>
      {data.rows.length === 0 ? (
        <p className="py-0.5 text-slate-400">本期無此類現金流量</p>
      ) : (
        data.rows.map((r) => (
          <div key={r.code} className="flex justify-between py-0.5">
            <span className="text-slate-600">{r.name}</span>
            <span className="font-mono">{fmt(r.amount)}</span>
          </div>
        ))
      )}
      <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
        <span>{totalLabel}</span>
        <span className="font-mono">{fmt(data.total)}</span>
      </div>
    </div>
  );
}

/** 現金流量表（直接法）：與資產負債表/損益表共用期別 */
export function CashFlow({ period }: { period: string }) {
  const q = trpc.ledger.cashFlow.useQuery({ period });

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="font-semibold mb-4">現金流量表（{q.data?.period ?? period}，直接法）</h2>
      {q.isLoading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : q.error ? (
        <p className="text-sm text-red-600">{q.error.message}</p>
      ) : q.data ? (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-slate-600">期初現金餘額</span>
            <span className="font-mono">{fmt(q.data.openingCash)}</span>
          </div>

          <AmountSection
            title="營業活動之現金流量"
            totalLabel="營業活動合計"
            data={q.data.operating}
          />
          <AmountSection
            title="投資活動之現金流量"
            totalLabel="投資活動合計"
            data={q.data.investing}
          />
          <AmountSection
            title="籌資活動之現金流量"
            totalLabel="籌資活動合計"
            data={q.data.financing}
          />

          <div className="border-t border-slate-200 pt-1">
            <div className="flex justify-between py-0.5 font-semibold">
              <span>三類活動現金流量合計</span>
              <span className="font-mono">{fmt(q.data.totalFlows)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-600">本期現金淨變動（期末 − 期初）</span>
              <span className="font-mono">{fmt(q.data.netChange)}</span>
            </div>
            <div className="flex justify-between py-0.5 font-semibold">
              <span>期末現金餘額</span>
              <span className="font-mono">{fmt(q.data.closingCash)}</span>
            </div>
          </div>

          <p
            className={`text-xs rounded-lg px-3 py-2 border ${
              q.data.reconciled
                ? "text-green-700 bg-green-50 border-green-200"
                : "text-red-700 bg-red-50 border-red-200"
            }`}
          >
            {q.data.reconciled
              ? `✓ 現金流量調節相符：三類活動合計 ${fmt(q.data.totalFlows)} = 期末 − 期初 ${fmt(q.data.netChange)}`
              : `✗ 現金流量調節不符：三類活動合計 ${fmt(q.data.totalFlows)} ≠ 期末 − 期初 ${fmt(q.data.netChange)}，請校驗分錄或快照！`}
          </p>

          <p className="text-xs text-slate-400">
            直接法：逐筆分類本期含現金科目之分錄；現金內部轉帳（1101 ↔ 1102）不列示。
          </p>
        </div>
      ) : null}
    </section>
  );
}
