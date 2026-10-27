"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "已生效", className: "text-green-700 bg-green-50 border-green-200" },
  PAST_DUE: { label: "付款失敗／逾期", className: "text-red-700 bg-red-50 border-red-200" },
  CANCELED: { label: "已取消", className: "text-amber-700 bg-amber-50 border-amber-200" },
  INACTIVE: { label: "未訂閱", className: "text-red-700 bg-red-50 border-red-200" },
};

/** 訂閱與付款（以公司為收費單位，OWNER 付款；Stripe 金鑰未設定時顯示提示） */
export function BillingManager() {
  const q = trpc.company.billingStatus.useQuery();
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openSession(kind: "checkout" | "portal") {
    setError(null);
    setBusy(kind);
    try {
      const res = await fetch(`/api/stripe/${kind}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? "操作失敗");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("網路錯誤，請重試");
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading) return <p className="text-sm text-slate-500">載入中…</p>;
  if (q.error) return <p className="text-sm text-red-600">{q.error.message}</p>;
  if (!q.data) return null;

  const s = STATUS_LABEL[q.data.subscriptionStatus] ?? STATUS_LABEL.INACTIVE;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">公司</span>
        <span className="text-sm font-medium">{q.data.companyName}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">訂閱狀態</span>
        <span className={`text-sm rounded-lg px-3 py-1 border font-medium ${s.className}`}>
          {s.label}
        </span>
      </div>
      {q.data.currentPeriodEnd && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">本期帳單到期日</span>
          <span className="text-sm font-mono">
            {new Date(q.data.currentPeriodEnd).toLocaleDateString()}
          </span>
        </div>
      )}

      {q.data.subscriptionStatus !== "ACTIVE" && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          訂閱未生效期間，公司成員（OWNER 除外）將無法登入。
        </p>
      )}

      {q.data.isOwner && (
        <div className="flex gap-3 pt-2">
          <button
            disabled={busy !== null || !q.data.priceConfigured}
            onClick={() => openSession("checkout")}
            className="rounded-lg bg-blue-600 text-white px-5 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "checkout" ? "處理中…" : q.data.subscriptionStatus === "ACTIVE" ? "更新訂閱" : "訂閱付款"}
          </button>
          {q.data.subscriptionStatus === "ACTIVE" && (
            <button
              disabled={busy !== null || !q.data.priceConfigured}
              onClick={() => openSession("portal")}
              className="rounded-lg border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "portal" ? "處理中…" : "管理訂閱（取消／更新卡片）"}
            </button>
          )}
        </div>
      )}

      {!q.data.priceConfigured && (
        <p className="text-xs text-slate-400">
          尚未設定 Stripe 金鑰（STRIPE_SECRET_KEY / STRIPE_PRICE_ID），付款功能未啟用。
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
