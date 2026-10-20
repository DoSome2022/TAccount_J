import { Reports } from "@/components/reports";

export const metadata = { title: "報表 — TAccounts" };

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">財務報表</h1>
      <Reports />
    </div>
  );
}
