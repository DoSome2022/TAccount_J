/**
 * 本地 IndexedDB（Dexie.js）— Local-First 第一層資料邊界
 * 存放原始（明文）分錄草稿；僅在用戶確認推送到雲端前存在於本機。
 */
import Dexie, { type EntityTable } from "dexie";

export type DraftLine = {
  accountCode: string;
  debit: string;
  credit: string;
  description?: string;
};

export type Draft = {
  id: string; // crypto.randomUUID()
  companyId: string;
  entryDate: string; // YYYY-MM-DD
  description: string;
  lines: DraftLine[];
  createdAt: number;
  updatedAt: number;
  /** 已被使用者刪除（墓碑），等待同步刪除雲端備份 */
  deletedAt: number | null;
  /** 已確認並成功推送雲端成為正式分錄 */
  postedEntryId: string | null;
};

export class TAccountsDB extends Dexie {
  drafts!: EntityTable<Draft, "id">;
  meta!: EntityTable<{ key: string; value: number }, "key">;

  constructor() {
    super("taccounts-local");
    this.version(1).stores({
      // id 為主鍵；companyId+updatedAt 供離線同步掃描
      drafts: "id, companyId, updatedAt, deletedAt",
      meta: "&key",
    });
  }
}

let dbInstance: TAccountsDB | null = null;

/** 瀏覽器端單例（避免 SSR 觸碰 IndexedDB） */
export function getLocalDB(): TAccountsDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB 僅可在瀏覽器端使用");
  }
  if (!dbInstance) dbInstance = new TAccountsDB();
  return dbInstance;
}

export function newDraftId(): string {
  return crypto.randomUUID();
}
