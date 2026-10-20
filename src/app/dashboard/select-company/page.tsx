import { CompanySelector } from "@/components/company-selector";

export const metadata = { title: "選擇公司 — TAccounts" };
export const instant = false;

export default function SelectCompanyPage() {
  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-900">選擇公司</h1>
      <CompanySelector />
    </div>
  );
}
