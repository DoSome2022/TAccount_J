/**
 * 草稿同步協定（Local-First，雲端只存密文）：
 *  - 上推：本地草稿 → encryptJSON(AES-GCM) → 雲端 EncryptedDraft 備份
 *  - 下拉：雲端密文 → 本地解密 → 合併（updatedAt 最後寫入者勝）
 *  - 刪除：本地墓碑（deletedAt）同步至雲端，其他裝置下拉後刪除本地草稿
 *
 * 金鑰由登入密碼派生（見 lib/crypto.ts），任何裝置以同密碼登入即可解密。
 */
import { getLocalDB, type Draft } from "@/lib/db";
import {
  decryptJSON,
  encryptJSON,
  getDraftKey,
  type EncryptedPayload,
} from "@/lib/crypto";

export type RemoteDraft = {
  clientDraftId: string;
  payload: EncryptedPayload;
  updatedAt: number; // epoch ms
  deletedAt: number | null;
};

export type DraftTransport = {
  pull: () => Promise<RemoteDraft[]>;
  push: (d: {
    clientDraftId: string;
    payload: EncryptedPayload;
    updatedAt: number;
    deletedAt: number | null;
  }) => Promise<void>;
};

export type SyncResult = { pulled: number; pushed: number };

const LAST_SYNC_KEY = "draftLastSyncAt";

/** 完整同步：先下拉合併、再上推本地異動 */
export async function syncDrafts(transport: DraftTransport): Promise<SyncResult> {
  const key = getDraftKey();
  if (!key) throw new Error("尚未登入或金鑰未派生，無法同步");
  const db = getLocalDB();
  const pulled = await pullAndMerge(db, key, transport.pull);
  const pushed = await pushLocalChanges(db, key, transport.push);
  return { pulled, pushed };
}

/** 下拉：解密並以 updatedAt 最後寫入者勝合併 */
async function pullAndMerge(
  db: ReturnType<typeof getLocalDB>,
  key: CryptoKey,
  pull: DraftTransport["pull"],
): Promise<number> {
  const remote = await pull();
  let count = 0;

  for (const r of remote) {
    const local = await db.drafts.get(r.clientDraftId);

    // 遠端墓碑：刪除本地（除非本地有更新的修改）
    if (r.deletedAt !== null) {
      if (local && local.updatedAt <= r.deletedAt) {
        await db.drafts.delete(r.clientDraftId);
        count++;
      }
      continue;
    }
    // 本地較新 → 保留本地（上推階段會覆蓋遠端）
    if (local && local.updatedAt >= r.updatedAt) continue;

    try {
      const draft = await decryptJSON<Draft>(key, r.payload);
      await db.drafts.put({
        ...draft,
        id: r.clientDraftId,
        updatedAt: Math.max(draft.updatedAt, r.updatedAt),
      });
      count++;
    } catch {
      // 密文損毀或金鑰不符 → 跳過（保留雲端備份不動）
      console.warn(`無法解密草稿 ${r.clientDraftId}，已跳過`);
    }
  }
  return count;
}

/** 上推：加密後傳送所有上次同步之後的異動（含墓碑） */
async function pushLocalChanges(
  db: ReturnType<typeof getLocalDB>,
  key: CryptoKey,
  push: DraftTransport["push"],
): Promise<number> {
  const lastSyncAt = (await db.meta.get(LAST_SYNC_KEY))?.value ?? 0;
  const dirty = await db.drafts
    .filter(
      (d) =>
        Math.max(d.updatedAt, d.deletedAt ?? 0) > lastSyncAt &&
        d.postedEntryId === null, // 已推送成功的正式分錄草稿不再同步
    )
    .toArray();
  if (dirty.length === 0) return 0;

  let maxTs = lastSyncAt;
  for (const d of dirty) {
    const ts = Math.max(d.updatedAt, d.deletedAt ?? 0);
    await push({
      clientDraftId: d.id,
      payload: await encryptJSON(key, d),
      updatedAt: ts,
      deletedAt: d.deletedAt,
    });
    if (ts > maxTs) maxTs = ts;
  }
  await db.meta.put({ key: LAST_SYNC_KEY, value: maxTs });
  return dirty.length;
}

/** 標記草稿已成為正式分錄（停止雲端同步並清除本地） */
export async function markDraftPosted(draftId: string, entryId: string): Promise<void> {
  const db = getLocalDB();
  await db.drafts.update(draftId, { postedEntryId: entryId });
  await db.drafts.delete(draftId);
}

/** 產生離線草稿（尚未連線或尚未登入金鑰時） */
export async function saveLocalDraft(draft: Omit<Draft, "createdAt" | "updatedAt" | "deletedAt" | "postedEntryId"> & Partial<Pick<Draft, "updatedAt">>): Promise<Draft> {
  const db = getLocalDB();
  const now = Date.now();
  const full: Draft = {
    ...draft,
    createdAt: now,
    updatedAt: draft.updatedAt ?? now,
    deletedAt: null,
    postedEntryId: null,
  };
  await db.drafts.put(full);
  return full;
}
