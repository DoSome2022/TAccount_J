"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { deriveDraftKey, setDraftKey } from "@/lib/crypto";

/**
 * 登入表單：密碼驗證通過後於瀏覽器端以同一密碼派生草稿加密金鑰
 * （多裝置一致性：任何裝置用相同密碼登入即可解密雲端草稿備份）。
 * 若帳號啟用 MFA，第一次提交會收到 MFA_REQUIRED，展開 TOTP 輸入。
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const justSetUp = searchParams.get("setup") === "done";
  const justReset = searchParams.get("reset") === "done";
  // layout 強制登出時帶的錯誤碼（凍結／訂閱失效）
  const urlCode = searchParams.get("code");
  const urlMessage =
    urlCode === "ACCOUNT_FROZEN"
      ? "此帳號已被凍結，請聯絡管理員"
      : urlCode === "SUBSCRIPTION_INACTIVE"
        ? "所屬公司訂閱未生效，請聯絡公司負責人完成付款"
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        totp: totp || undefined,
      });
      if (!res) throw new Error("網路錯誤");

      if (res.error) {
        // next-auth v5 beta：自訂錯誤碼在 res.code，res.error 固定為 CredentialsSignin
        if (res.code === "ACCOUNT_FROZEN") {
          setError("此帳號已被凍結，請聯絡管理員");
        } else if (res.code === "SUBSCRIPTION_INACTIVE") {
          setError("所屬公司訂閱未生效，請聯絡公司負責人完成付款");
        } else if (res.code === "MFA_REQUIRED") {
          setMfaRequired(true);
          setError("此帳號已啟用 MFA，請輸入驗證器上的 6 位數驗證碼");
        } else if (res.code === "INVALID_TOTP") {
          setError("MFA 驗證碼錯誤，請重試");
        } else {
          setError("帳號或密碼錯誤");
        }
        return;
      }

      // 登入成功：以密碼派生草稿金鑰（存記憶體，刷新後需重新登入）
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      if (session?.user?.id && password) {
        const key = await deriveDraftKey(password, session.user.id);
        setDraftKey(key);
      }
      router.push(callbackUrl);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {justSetUp && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          ✅ 安裝完成！請用剛才設定的管理員帳號登入。
        </p>
      )}
      {justReset && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          ✅ 密碼已重設，請用新密碼登入。
        </p>
      )}
      {urlMessage && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {urlMessage}
        </p>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">密碼</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="••••••••"
        />
      </div>
      {mfaRequired && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">MFA 驗證碼</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="000000"
            maxLength={6}
          />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "登入中…" : "登入"}
      </button>
      <p className="text-sm text-center">
        <a href="/forgot-password" className="text-blue-600 hover:underline">
          忘記密碼？
        </a>
      </p>
    </form>
  );
}
