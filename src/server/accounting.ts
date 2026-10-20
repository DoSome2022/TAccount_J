import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

/**
 * 會計核心鐵律：六大類科目獨立公式
 *  資產 (1xxx, 借): 餘額 = 期初 + Σ借 - Σ貸
 *  負債 (2xxx, 貸): 餘額 = 期初 + Σ貸 - Σ借
 *  資本 (3xxx, 貸): 餘額 = 期初 + Σ貸 - Σ借
 *  收入 (4xxx, 貸): 餘額 = 期初 + Σ貸 - Σ借
 *  銷貨成本 (5xxx, 借): 餘額 = 期初 + Σ借 - Σ貸
 *  費用 (6xxx, 借): 餘額 = 期初 + Σ借 - Σ貸
 *
 * 本系統以「借方為正」的簽名餘額統一儲存，
 * 因此任一科目餘額增量 = debit - credit（六類公式即自動滿足）。
 */

export type LineInput = {
  accountCode: string;
  debit: string; // 十進制字串，避免浮點誤差
  credit: string;
  description?: string | null;
};

/** 借貸平衡鐵律：Σ Debit === Σ Credit */
export function isBalanced(lines: LineInput[]): boolean {
  const d = lines.reduce(
    (s, l) => s.plus(new Prisma.Decimal(l.debit || "0")),
    new Prisma.Decimal(0),
  );
  const c = lines.reduce(
    (s, l) => s.plus(new Prisma.Decimal(l.credit || "0")),
    new Prisma.Decimal(0),
  );
  return d.equals(c);
}

/**
 * Canonical Data 序列化（決定性，供 SHA-256 使用）
 * 鐵律：同一筆分錄的資料必須產生唯一且可重現的字串，
 * 任何欄位遭竄改（含金額、科目、日期、明細順序）都會改變 hash。
 */
export function canonicalizeEntry(input: {
  entryNo: number;
  entryDate: string; // YYYY-MM-DD
  description: string;
  lines: LineInput[];
}): string {
  const sorted = [...input.lines].sort((a, b) =>
    a.accountCode.localeCompare(b.accountCode),
  );
  const linesStr = sorted
    .map((l) => {
      const d = new Prisma.Decimal(l.debit || "0").toFixed(2);
      const c = new Prisma.Decimal(l.credit || "0").toFixed(2);
      return `${l.accountCode}|${d}|${c}|${l.description ?? ""}`;
    })
    .join(";");
  return [
    input.entryNo,
    input.entryDate,
    input.description,
    linesStr,
  ].join("\n");
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** 公司 hash 鏈的創世區塊 */
export function genesisHash(companyId: string): string {
  return sha256Hex(`GENESIS:${companyId}`);
}

/**
 * 雜湊鏈鐵律：Hash_n = SHA256(Hash_{n-1} + canonicalData_n)
 * @param prevHash 上一筆分錄的 hash（第一筆為公司 genesisHash）
 */
export function computeEntryHash(prevHash: string, canonicalData: string): string {
  return sha256Hex(`${prevHash}${canonicalData}`);
}

/** 期別字串：YYYY-MM */
export function periodOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** 期別推移（供快照級聯） */
export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + 1, 1));
  return periodOf(d);
}

/** 前一期別（供本期異動計算：movement = balance(P) - balance(P-1)） */
export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - 1, 1));
  return periodOf(d);
}

export function periodCompare(a: string, b: string): number {
  return a.localeCompare(b); // YYYY-MM 字典序即時間序
}
