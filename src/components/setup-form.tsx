"use client";

/**
 * 一次性安裝表單：建立第一位 OWNER 管理員 + 第一間公司。
 * 送出成功後 /setup 將永久關閉（系統已有使用者）。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SetupForm({ requiresToken }: { requiresToken: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    companyName: "",
    companyCode: "",
    setupToken: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          companyName: form.companyName,
          companyCode: form.companyCode,
          setupToken: form.setupToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "安裝失敗");
        return;
      }
      router.push("/login?setup=done");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        首次安裝：建立系統第一位管理員（OWNER）與第一間公司。
        完成後此頁面將永久關閉。
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">管理員帳號</h2>
        <div className="space-y-3">
          <input className={input} placeholder="姓名" required maxLength={50}
            value={form.name} onChange={(e) => set("name", e.target.value)} />
          <input className={input} type="email" placeholder="管理員 Email" required
            value={form.email} onChange={(e) => set("email", e.target.value)} />
          <input className={input} type="password" placeholder="密碼（至少 8 位）" required minLength={8}
            value={form.password} onChange={(e) => set("password", e.target.value)} />
          <input className={input} type="password" placeholder="確認密碼" required minLength={8}
            value={form.confirm} onChange={(e) => set("confirm", e.target.value)} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">公司</h2>
        <div className="space-y-3">
          <input className={input} placeholder="公司名稱（例：示範科技有限公司）" required maxLength={100}
            value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
          <input className={input} placeholder="公司代碼（2-10 位英數字，例：DEMO）" required
            value={form.companyCode} onChange={(e) => set("companyCode", e.target.value)} />
        </div>
      </div>

      {requiresToken && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">安裝金鑰</h2>
          <input className={input} type="password" placeholder="SETUP_TOKEN（由部署者提供）" required
            value={form.setupToken} onChange={(e) => set("setupToken", e.target.value)} />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "安裝中…" : "完成安裝"}
      </button>
    </form>
  );
}
