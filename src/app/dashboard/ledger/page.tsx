import { TrialBalance } from "@/components/trial-balance";

export const metadata = { title: "試算表 — TAccounts" };

export default function LedgerPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">試算表</h1>
      <TrialBalance />
    </div>
  );
}
