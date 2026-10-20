"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

type Check = Awaited<ReturnType<typeof import("@/server/invite").checkInvitation>>;

const REASON_TEXT: Record<string, string> = {
  INVALID: "邀請連結無效",
  EXPIRED: "邀請連結已過期，請聯絡管理員重新發送",
  ACCEPTED: "此邀請已被使用",
};

export function InviteAccept({ token, check }: { token: string; check: Check }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!check.ok) {
    return (
      <div className="space-y-4">
        <p className="text-red-600 text-sm">{REASON_TEXT[check.reason] ?? "邀請無效"}</p>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">
          回到登入頁
        </Link>
      </div>
    );
  }

  const { email: inviteEmail } = check;

  async function accept() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "LOGIN_REQUIRED") {
          router.push(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
          return;
        }
        setError(data.message ?? "接受邀請失敗");
        return;
      }
      // 新使用者：建立成功後自動登入
      if (password) {
        const r = await signIn("credentials", { redirect: false, email: inviteEmail, password });
        if (r?.error) {
          setError("帳號已建立，請前往登入頁登入");
          router.push("/login");
          return;
        }
      }
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 800);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">{check.companyName}</span> 邀請{" "}
        <span className="font-medium text-slate-900">{check.email}</span> 加入，角色：{" "}
        <span className="font-medium">{check.role}</span>
      </p>

      {done ? (
        <p className="text-green-600 text-sm">✅ 已成功加入，正在前往儀表板…</p>
      ) : check.userExists ? (
        <>
          <p className="text-sm text-slate-600">此信箱已有帳號，請先登入後再接受邀請。</p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
            className="block w-full text-center rounded-lg bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700"
          >
            前往登入
          </Link>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            accept();
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">設定密碼（至少 8 位）</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "處理中…" : "建立帳號並接受邀請"}
          </button>
        </form>
      )}
    </div>
  );
}
