import { DashboardOverview } from "@/components/dashboard-overview";

export const metadata = { title: "儀表板 — TAccounts" };

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">儀表板</h1>
      <DashboardOverview />
    </div>
  );
}
