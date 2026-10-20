/**
 * 客戶端加密（Web Crypto API）— 三層數據邊界鐵律的第一層防線：
 *  原始草稿只存在本地 IndexedDB；同步到雲端前必須在此加密，
 *  雲端只存放 { iv, ciphertext } 密文，無金鑰即無法解密。
 *
 * 金鑰管理（多裝置一致性）：
 *  金鑰由「帳號密碼」經 PBKDF2 派生（600,000 次 SHA-256 → AES-256-GCM），
 *  同一位使用者用相同密碼在任何裝置登入，都能派生出相同金鑰，
 *  因此更換裝置也能解密雲端備份的草稿；密碼本身從不離開瀏覽器之外
 *  （僅以 HTTPS 送交伺服器做 bcrypt 比對）。
 */

export type EncryptedPayload = {
  v: 1;
  iv: string; // base64
  ciphertext: string; // base64（含 GCM tag）
  kdf: { iterations: number; hash: "SHA-256" };
};

const PBKDF2_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 由登入密碼派生草稿加密金鑰（salt 固定綁定使用者 id） */
export async function deriveDraftKey(password: string, userId: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(`taccounts-draft:v1:${userId}`) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJSON(key: CryptoKey, data: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data)) as BufferSource,
  );
  return {
    v: 1,
    iv: toB64(iv),
    ciphertext: toB64(ct),
    kdf: { iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
  };
}

export async function decryptJSON<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(payload.iv) },
    key,
    fromB64(payload.ciphertext),
  );
  return JSON.parse(dec.decode(pt)) as T;
}

/** 記憶體金鑰（登入後派生，登出/刷新即棄） */
let currentKey: CryptoKey | null = null;

export function setDraftKey(key: CryptoKey | null): void {
  currentKey = key;
}

export function getDraftKey(): CryptoKey | null {
  return currentKey;
}
