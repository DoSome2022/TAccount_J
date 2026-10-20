"use client";

/**
 * 草稿管理 — Local-First 中心：
 *  - 草稿只存本機 IndexedDB；「同步」時先 AES-GCM 加密再上雲（伺服器不可解）
 *  - 多裝置：換裝置登入後於此頁「同步」，即可拉回密文並以密碼派生金鑰解密
 */
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { getLocalDB } from "@/lib/db";
import { getDraftKey, type EncryptedPayload } from "@/lib/crypto";
import { syncDrafts } from "@/lib/draftSync";
import { vanillaTrpc } from "@/lib/trpc/vanilla";

export function DraftsManager() {
  const drafts = useLiveQuery(
    () =>
      getLocalDB()
        .drafts.filter((d) => d.deletedAt === null)
        .reverse()
        .sortBy("updatedAt"),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const keyUnlocked = !!getDraftKey();

  async function doSync() {
    if (!getDraftKey()) {
      setResult("⚠️ 草稿金鑰未解鎖：請先登出再重新登入（金鑰由登入密碼派生）");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await syncDrafts({
        pull: async () => {
          const rows = await vanillaTrpc.draft.pull.query();
          return rows.map((row) => ({
            ...row,
            payload: row.payload as never as EncryptedPayload,
          }));
        },
        push: async (d) => {
          await vanillaTrpc.draft.push.mutate(d);
        },
      });
      setResult(`同步完成：下拉 ${r.pulled} 筆、上推 ${r.pushed} 筆 ✅`);
    } catch (e) {
      setResult(`同步失敗：${e instanceof Error ? e.message : "網路錯誤"}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft(id: string) {
    const db = getLocalDB();
    await db.drafts.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
    if (getDraftKey()) await doSync();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">本機草稿（IndexedDB）</h2>
            <p className="text-xs text-slate-500 mt-1">
              草稿明文僅存在此瀏覽器；雲端只保存加密備份，伺服器無法解密。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!keyUnlocked && (
              <span className="text-xs text-amber-600">
                ⚠️ 金鑰未解鎖（請重新登入以派生草稿金鑰）
              </span>
            )}
            <button
              onClick={doSync}
              disabled={busy}
              className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "同步中…" : "與雲端同步（加密）"}
            </button>
          </div>
        </div>
        {result && <p className="text-sm text-slate-600">{result}</p>}
      </div>

      {!drafts || drafts.length === 0 ? (
        <p className="text-sm text-slate-500">尚無草稿。</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200">
                <th className="py-2 px-4">日期</th>
                <th className="py-2 px-4">摘要</th>
                <th className="py-2 px-4">明細數</th>
                <th className="py-2 px-4">最後修改</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id} className="border-b border-slate-100">
                  <td className="py-2 px-4">{d.entryDate}</td>
                  <td className="py-2 px-4">{d.description || "（無摘要）"}</td>
                  <td className="py-2 px-4">{d.lines.length}</td>
                  <td className="py-2 px-4 text-slate-500">
                    {new Date(d.updatedAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-4 space-x-2">
                    <Link
                      href={`/dashboard/entries/new?draft=${d.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      編輯
                    </Link>
                    <button
                      onClick={() => removeDraft(d.id)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
