import { DraftsManager } from "@/components/drafts-manager";

export const metadata = { title: "草稿 — TAccounts" };

export default function DraftsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">草稿（本地優先 + 加密雲端備份）</h1>
      <DraftsManager />
    </div>
  );
}
