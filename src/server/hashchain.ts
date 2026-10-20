import { Prisma } from "@/generated/prisma/client";
import {
  computeEntryHash,
  canonicalizeEntry,
  genesisHash,
  LineInput,
} from "@/server/accounting";

export type PostEntryInput = {
  entryDate: string; // YYYY-MM-DD
  description: string;
  lines: LineInput[];
};

export type EntryWithLines = {
  entryNo: number;
  entryDate: Date;
  description: string;
  hash: string;
  prevHash: string;
  status: string;
  lines: LineInput[];
};

/**
 * 依序重新計算整條 hash 鏈的預期值。
 * 任何一筆歷史資料被竄改（含 Prisma 忽略不計的欄位），
 * 預期 hash 都會與 DB 儲存值不符 → 鏈斷裂。
 */
export function recomputeChain(
  genesis: string,
  entries: EntryWithLines[],
): { index: number; entryNo: number; expected: string; stored: string }[] {
  const broken: { index: number; entryNo: number; expected: string; stored: string }[] = [];
  let prev = genesis;
  entries.forEach((e, i) => {
    const canonical = canonicalizeEntry({
      entryNo: e.entryNo,
      entryDate: e.entryDate.toISOString().slice(0, 10),
      description: e.description,
      lines: e.lines,
    });
    const expected = computeEntryHash(prev, canonical);
    if (expected !== e.hash || e.prevHash !== prev) {
      broken.push({
        index: i,
        entryNo: e.entryNo,
        expected,
        stored: e.hash,
      });
    }
    prev = e.hash; // 以儲存值繼續串鏈，才能定位出「第一個」斷點之後的連鎖影響
  });
  return broken;
}

/** 建立新公司時初始化 genesisHash */
export function computeGenesisHash(companyId: string): string {
  return genesisHash(companyId);
}
