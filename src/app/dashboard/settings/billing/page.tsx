import { BillingManager } from "@/components/billing-manager";

export const metadata = { title: "訂閱與付款 — TAccounts" };

export default function BillingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">訂閱與付款</h1>
      <BillingManager />
    </div>
  );
}
