"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export type ShellCompany = { companyId: string; name: string; code: string; role: string };

const NAV = [
  { href: "/dashboard", label: "儀表板" },
  { href: "/dashboard/entries/new", label: "新增分錄" },
  { href: "/dashboard/entries", label: "分錄列表" },
  { href: "/dashboard/drafts", label: "草稿（本地）" },
  { href: "/dashboard/ledger", label: "試算表" },
  { href: "/dashboard/reports", label: "報表" },
  { href: "/dashboard/verify", label: "防竄改校驗" },
];

export function Shell({
  children,
  userName,
  userEmail,
  companies,
  activeCompanyId,
  activeRole,
  signOutAction,
}: {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  companies: ShellCompany[];
  activeCompanyId: string | null;
  activeRole: string | null;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const isAdmin = activeRole === "ADMIN" || activeRole === "OWNER";

  async function switchCompany(companyId: string) {
    if (!companyId || companyId === activeCompanyId) return;
    setSwitching(true);
    try {
      await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-bold text-lg">
              TAccounts
            </Link>
            {activeCompanyId && (
              <select
                value={activeCompanyId}
                disabled={switching}
                onChange={(e) => switchCompany(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm"
              >
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}（{c.role}）
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-300">
              {userName ?? userEmail}
              {activeRole && (
                <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-xs">{activeRole}</span>
              )}
            </span>
            <form action={signOutAction}>
              <button className="text-slate-300 hover:text-white">登出</button>
            </form>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 text-sm whitespace-nowrap ${
                pathname === item.href
                  ? "bg-slate-100 text-slate-900 rounded-t-lg font-medium"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <Link
                href="/dashboard/admin/invites"
                className={`px-3 py-2 text-sm whitespace-nowrap ${
                  pathname.startsWith("/dashboard/admin")
                    ? "bg-slate-100 text-slate-900 rounded-t-lg font-medium"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                成員邀請
              </Link>
              <Link
                href="/dashboard/admin/audit"
                className={`px-3 py-2 text-sm whitespace-nowrap ${
                  pathname.startsWith("/dashboard/admin/audit")
                    ? "bg-slate-100 text-slate-900 rounded-t-lg font-medium"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                審計日誌
              </Link>
            </>
          )}
          <Link
            href="/dashboard/settings/mfa"
            className={`px-3 py-2 text-sm whitespace-nowrap ${
              pathname.startsWith("/dashboard/settings")
                ? "bg-slate-100 text-slate-900 rounded-t-lg font-medium"
                : "text-slate-300 hover:text-white"
            }`}
          >
            MFA 設定
          </Link>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
