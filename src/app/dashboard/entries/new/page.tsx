import { EntryForm } from "@/components/entry-form";

export const metadata = { title: "新增分錄 — TAccounts" };

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft } = await searchParams;
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-900">
        {draft ? "編輯草稿" : "新增分錄"}
        <span className="ml-3 text-xs font-normal text-slate-500">
          本地驗證通過後才可推送；伺服器會二次覆核並寫入防竄改雜湊鏈
        </span>
      </h1>
      <EntryForm draftId={draft} />
    </div>
  );
}
