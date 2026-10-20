import { ChainVerify } from "@/components/chain-verify";

export const metadata = { title: "防竄改校驗 — TAccounts" };

export default function VerifyPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">防竄改雜湊鏈校驗</h1>
      <ChainVerify />
    </div>
  );
}
