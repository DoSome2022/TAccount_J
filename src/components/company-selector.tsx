"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

export function CompanySelector() {
  const router = useRouter();
  const q = trpc.company.list.useQuery();

  async function pick(companyId: string) {
    await fetch("/api/company/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    router.refresh();
  }

  if (q.isLoading) return <p className="text-slate-500 text-sm">載入中…</p>;

  const companies = q.data ?? [];
  if (companies.length === 0) {
    return (
      <p className="text-slate-600 text-sm">
        你尚未加入任何公司，請聯絡管理員發送邀請連結。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {companies.map((c) => (
        <li key={c.companyId}>
          <button
            onClick={() => pick(c.companyId)}
            className="w-full text-left bg-white border border-slate-200 hover:border-blue-400 rounded-xl px-5 py-4"
          >
            <div className="font-semibold text-slate-900">{c.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {c.code} · 角色：{c.role}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
