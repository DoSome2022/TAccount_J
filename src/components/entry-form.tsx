"use client";

/**
 * 分錄輸入表單 — Phase 3 Local-First 資料流：
 *  1. React Hook Form + Zod 本地驗證（格式 + 借貸平衡 Σ借=Σ貸）
 *  2. 「存草稿」→ IndexedDB（Dexie）→ AES-GCM 加密 → 雲端備份（伺服器不可解）
 *  3. 「過帳」→ tRPC Push → 伺服器二次覆核 → SHA-256 雜湊鏈寫入 → 快照更新
 */
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { getLocalDB, newDraftId, type Draft } from "@/lib/db";
import { getDraftKey, type EncryptedPayload } from "@/lib/crypto";
import { saveLocalDraft, markDraftPosted, syncDrafts } from "@/lib/draftSync";
import { vanillaTrpc } from "@/lib/trpc/vanilla";

const AMOUNT = /^\d{0,15}(\.\d{1,2})?$/;

const formSchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇日期"),
    description: z.string().min(1, "請輸入摘要"),
    lines: z
      .array(
        z.object({
          accountCode: z.string().min(2, "請選擇科目"),
          debit: z.string().regex(AMOUNT, "金額格式錯誤"),
          credit: z.string().regex(AMOUNT, "金額格式錯誤"),
        }),
      )
      .min(2, "複式記帳至少兩行"),
  })
  .superRefine((val, ctx) => {
    let debit = 0;
    let credit = 0;
    for (const l of val.lines) {
      debit += Math.round(parseFloat(l.debit || "0") * 100);
      credit += Math.round(parseFloat(l.credit || "0") * 100);
      if (parseFloat(l.debit || "0") > 0 && parseFloat(l.credit || "0") > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "同一行不可同時填借方與貸方",
          path: ["lines"],
        });
      }
    }
    if (debit !== credit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `借貸不平衡：借 ${(debit / 100).toFixed(2)} ≠ 貸 ${(credit / 100).toFixed(2)}`,
        path: ["lines"],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const TYPE_LABEL: Record<string, string> = {
  ASSET: "資產",
  LIABILITY: "負債",
  EQUITY: "資本",
  REVENUE: "收入",
  COGS: "銷貨成本",
  EXPENSE: "費用",
};

function emptyLine() {
  return { accountCode: "", debit: "", credit: "" };
}

export function EntryForm({ draftId }: { draftId?: string }) {
  const router = useRouter();
  const accountsQ = trpc.account.list.useQuery();
  const postMutation = trpc.journal.post.useMutation();
  const [posted, setPosted] = useState<{ entryNo: number; hash: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const draft = useLiveQuery(
    () => (draftId ? getLocalDB().drafts.get(draftId) : undefined),
    [draftId],
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: draft
      ? {
          entryDate: draft.entryDate,
          description: draft.description,
          lines: draft.lines.map((l) => ({
            accountCode: l.accountCode,
            debit: l.debit,
            credit: l.credit,
          })),
        }
      : undefined,
    defaultValues: {
      entryDate: today,
      description: "",
      lines: [emptyLine(), emptyLine()],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const lines = watch("lines");
  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001 && (totalDebit > 0 || totalCredit > 0);

  const accounts = accountsQ.data ?? [];
  const byType = useMemo(() => {
    const m = new Map<string, typeof accounts>();
    for (const a of accounts) {
      if (!m.has(a.type)) m.set(a.type, []);
      m.get(a.type)!.push(a);
    }
    return m;
  }, [accounts]);

  // 以 draftId 載入草稿後填入表單（useLiveQuery 於上方宣告，避免 TDZ）
  const draftForSave = draft ?? null;

  async function handleSaveDraft() {
    const values = getValues();
    if (values.lines.length === 0) return;
    const now = Date.now();
    const draft: Draft = {
      id: draftForSave?.id ?? newDraftId(),
      companyId: "",
      entryDate: values.entryDate,
      description: values.description,
      lines: values.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit || "0",
        credit: l.credit || "0",
      })),
      createdAt: draftForSave?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      postedEntryId: null,
    };
    await saveLocalDraft(draft);
    setSaveMsg(`已存至本地草稿（${new Date().toLocaleTimeString()}）`);
    if (getDraftKey()) {
      try {
        await syncDrafts({
          pull: async () => {
            const rows = await vanillaTrpc.draft.pull.query();
            return rows.map((row) => ({
              ...row,
              payload: row.payload as never as EncryptedPayload,
            }));
          },
          push: async (d) => {
            await vanillaTrpc.draft.push.mutate(d);
          },
        });
        setSaveMsg("已存至本地草稿，並加密備份至雲端 ✅");
      } catch {
        setSaveMsg("已存至本地草稿（雲端備份失敗，稍後可於草稿頁重試）");
      }
    } else {
      setSaveMsg("已存至本地草稿（金鑰未解鎖，未上雲備份）");
    }
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const result = await postMutation.mutateAsync({
        entryDate: values.entryDate,
        description: values.description,
        lines: values.lines.map((l) => ({
          accountCode: l.accountCode,
          debit: l.debit || "0",
          credit: l.credit || "0",
        })),
      });
      if (draftForSave) await markDraftPosted(draftForSave.id, result.entryId);
      setPosted(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "推送失敗";
      // 離線/伺服器錯誤：資料仍在本地草稿，不遺失
      await handleSaveDraft().catch(() => undefined);
      setFormError(`${msg}。已自動存為本地草稿，可稍後重試。`);
    }
  }

  if (posted) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-4">
        <h2 className="text-xl font-bold text-green-700">✅ 過帳成功</h2>
        <p className="text-slate-600">
          分錄編號 <span className="font-mono font-bold">#{String(posted.entryNo).padStart(3, "0")}</span>
        </p>
        <div>
          <p className="text-xs text-slate-500 mb-1">本筆 SHA-256 雜湊（已鏈入防竄改鏈）</p>
          <p className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 break-all">
            {posted.hash}
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => {
              setPosted(null);
              reset({ entryDate: today, description: "", lines: [emptyLine(), emptyLine()] });
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            再新增一筆
          </button>
          <button
            onClick={() => router.push("/dashboard/entries")}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700"
          >
            查看分錄列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
            <input
              type="date"
              {...register("entryDate")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {errors.entryDate && <p className="text-xs text-red-600 mt-1">{errors.entryDate.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">摘要</label>
            <input
              {...register("description")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="例：十月辦公室租金"
            />
            {errors.description && (
              <p className="text-xs text-red-600 mt-1">{errors.description.message}</p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 w-56">科目</th>
                <th className="py-2 w-40">借方金額</th>
                <th className="py-2 w-40">貸方金額</th>
                <th className="py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => (
                <tr key={field.id} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <select
                      {...register(`lines.${i}.accountCode`)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">選擇科目…</option>
                      {[...byType.entries()].map(([type, list]) => (
                        <optgroup key={type} label={TYPE_LABEL[type] ?? type}>
                          {list.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.code} {a.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      {...register(`lines.${i}.debit`)}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right font-mono"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      {...register(`lines.${i}.credit`)}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right font-mono"
                    />
                  </td>
                  <td className="py-2">
                    {fields.length > 2 && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        移除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => append(emptyLine())}
          className="text-sm text-blue-600 hover:underline"
        >
          + 新增明細行
        </button>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
          <div className="space-x-4">
            <span>借：<span className="font-mono font-semibold">{totalDebit.toFixed(2)}</span></span>
            <span>貸：<span className="font-mono font-semibold">{totalCredit.toFixed(2)}</span></span>
            <span
              className={`font-medium ${
                balanced ? "text-green-600" : "text-red-600"
              }`}
            >
              {balanced ? "✓ 借貸平衡" : "✗ 借貸不平衡"}
            </span>
          </div>
          {errors.lines?.message && (
            <span className="text-xs text-red-600">{errors.lines.message}</span>
          )}
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
        {saveMsg && <p className="text-sm text-slate-500">{saveMsg}</p>}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            存草稿（加密備份）
          </button>
          <button
            type="submit"
            disabled={postMutation.isPending}
            className="rounded-lg bg-blue-600 text-white px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {postMutation.isPending ? "推送中…" : "過帳（推送到雲端）"}
          </button>
        </div>
      </div>
    </form>
  );
}
