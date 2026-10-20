"use client";

/**
 * MFA（TOTP）設定：
 *  - 啟用：驗證密碼 → 顯示 secret/otpauth URI（只出現一次）→ 輸入驗證器 6 位碼確認
 *  - 停用：需密碼 + 現行 TOTP
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export function MfaManager() {
  const statusQ = trpc.mfa.status.useQuery();
  const beginM = trpc.mfa.beginEnable.useMutation();
  const confirmM = trpc.mfa.confirmEnable.useMutation();
  const disableM = trpc.mfa.disable.useMutation();

  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (statusQ.isLoading) return <p className="text-sm text-slate-500">載入中…</p>;

  async function begin() {
    setError(null);
    setMsg(null);
    try {
      const r = await beginM.mutateAsync({ password });
      setSetup(r);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "密碼驗證失敗");
    }
  }

  async function confirm() {
    if (!setup) return;
    setError(null);
    try {
      await confirmM.mutateAsync({ secret: setup.secret, totp: code });
      setSetup(null);
      setCode("");
      setMsg("✅ MFA 已啟用");
      statusQ.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "確認失敗");
    }
  }

  async function disable() {
    setError(null);
    setMsg(null);
    try {
      await disableM.mutateAsync({ password, totp: code });
      setMsg("✅ MFA 已停用");
      setPassword("");
      setCode("");
      statusQ.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "停用失敗");
    }
  }

  const enabled = statusQ.data?.mfaEnabled ?? false;

  return (
    <div className="space-y-6 max-w-xl">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">雙因素認證（TOTP）</h2>
            <p className="text-sm text-slate-500 mt-1">
              狀態：
              {enabled ? (
                <span className="text-green-600 font-medium">已啟用</span>
              ) : (
                <span className="text-red-500 font-medium">未啟用</span>
              )}
            </p>
          </div>
        </div>

        {!enabled && !setup && (
          <div className="mt-4 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="輸入密碼以開始設定"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={begin}
              disabled={beginM.isPending || !password}
              className="rounded-lg bg-blue-600 text-white px-5 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              產生金鑰
            </button>
          </div>
        )}

        {setup && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
              <p className="text-sm text-slate-600">
                在驗證器應用（Google Authenticator / Authy 等）手動輸入以下金鑰：
              </p>
              <p className="font-mono text-sm bg-white rounded p-2 break-all border border-slate-200">
                {setup.secret}
              </p>
              <details className="text-xs text-slate-500">
                <summary>otpauth URI（供進階匯入）</summary>
                <p className="font-mono break-all mt-1">{setup.uri}</p>
              </details>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="輸入驗證器顯示的 6 位數"
              maxLength={6}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-[0.3em]"
            />
            <button
              onClick={confirm}
              disabled={confirmM.isPending || code.length !== 6}
              className="rounded-lg bg-green-600 text-white px-5 py-2 text-sm hover:bg-green-700 disabled:opacity-50"
            >
              確認並啟用
            </button>
          </div>
        )}

        {enabled && (
          <div className="mt-4 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密碼"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="現行 TOTP 驗證碼"
              maxLength={6}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-[0.3em]"
            />
            <button
              onClick={disable}
              disabled={disableM.isPending || !password || code.length !== 6}
              className="rounded-lg bg-red-600 text-white px-5 py-2 text-sm hover:bg-red-700 disabled:opacity-50"
            >
              停用 MFA
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {msg && <p className="text-sm text-green-600 mt-3">{msg}</p>}
      </div>
    </div>
  );
}
