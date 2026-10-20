import { z } from "zod";

const AMOUNT = /^\d{1,15}(\.\d{1,2})?$/;

export const lineSchema = z.object({
  accountCode: z.string().min(2).max(20),
  debit: z.string().regex(AMOUNT, "金額格式錯誤"),
  credit: z.string().regex(AMOUNT, "金額格式錯誤"),
  description: z.string().max(100).optional(),
});

/**
 * 分錄輸入（伺服器端 schema，前端以相同規則於本地先驗證）
 * 鐵律：Σ Debit === Σ Credit
 */
export const entrySchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式應為 YYYY-MM-DD"),
    description: z.string().min(1, "請輸入摘要").max(200),
    lines: z.array(lineSchema).min(2, "複式記帳至少需要兩行明細").max(100),
  })
  .superRefine((val, ctx) => {
    let debit = 0;
    let credit = 0;
    for (const l of val.lines) {
      debit += Math.round(parseFloat(l.debit || "0") * 100);
      credit += Math.round(parseFloat(l.credit || "0") * 100);
      const d = parseFloat(l.debit || "0");
      const c = parseFloat(l.credit || "0");
      if (d === 0 && c === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `明細 ${l.accountCode} 借貸不可同時為 0`,
        });
      }
      if (d > 0 && c > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `明細 ${l.accountCode} 不可同時有借方與貸方金額`,
        });
      }
    }
    if (debit !== credit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `借貸不平衡：借 ${(debit / 100).toFixed(2)} ≠ 貸 ${(credit / 100).toFixed(2)}`,
      });
    }
  });

export type EntryInput = z.infer<typeof entrySchema>;
