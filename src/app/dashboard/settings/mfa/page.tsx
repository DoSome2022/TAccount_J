import { MfaManager } from "@/components/mfa-manager";

export const metadata = { title: "MFA 設定 — TAccounts" };

export default function MfaSettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">MFA 多因素認證</h1>
      <MfaManager />
    </div>
  );
}
