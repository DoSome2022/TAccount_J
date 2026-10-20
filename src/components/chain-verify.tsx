"use client";

import { trpc } from "@/lib/trpc/client";

/**
 * Hash 鏈完整性校驗工具：
 * 逐筆重新計算 SHA-256（Hash_n = SHA256(Hash_{n-1} + Data_n)），
 * 與資料庫儲存值比對。任何後台 SQL 竄改都會使鏈斷裂。
 */
export function ChainVerify() {
  const verifyQ = trpc.ledger.verifyChain.useQuery(undefined, {
    enabled: false,
  });

  async function run() {
    await verifyQ.refetch();
  }

  const result = verifyQ.data;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <p className="text-sm text-slate-600">
          系統會依序重新計算每一筆正式分錄的 SHA-256 雜湊，並與資料庫儲存值比對。
          若有人在後台直接以 SQL 修改歷史會計數據，雜湊鏈會在此斷裂。
        </p>
        <button
          onClick={run}
          disabled={verifyQ.isFetching}
          className="rounded-lg bg-blue-600 text-white px-5 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {verifyQ.isFetching ? "校驗中…" : "開始完整校驗"}
        </button>

        {result && (
          <div
            className={`rounded-xl border p-5 ${
              result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
            }`}
          >
            {result.ok ? (
              <div className="space-y-2">
                <p className="font-semibold text-green-700">
                  ✅ Hash 鏈完整 — 共校驗 {result.checked} 筆分錄，未發現任何竄改
                </p>
                <p className="text-xs text-green-600 font-mono">
                  創世區塊：{result.genesisHash}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-semibold text-red-700">
                  🚨 偵測到 {result.broken.length} 處鏈結斷裂！歷史資料可能已被竄改！
                </p>
                {result.broken.map((b) => (
                  <div
                    key={b.entryNo}
                    className="text-xs bg-white rounded border border-red-200 p-3 space-y-1"
                  >
                    <p>分錄 #{b.entryNo}</p>
                    <p className="font-mono break-all">資料庫值：{b.stored}</p>
                    <p className="font-mono break-all">重算預期：{b.expected}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
