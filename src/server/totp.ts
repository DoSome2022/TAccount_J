/**
 * TOTP（RFC 6238）— MFA 多因素認證
 * 以 Node crypto 原生實作（HMAC-SHA1、6 位數、30 秒步長、±1 步容差），
 * 避免引入第三方 OTP 依賴。
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 產生 base32 secret（20 bytes 熵，相容 Google Authenticator 等 TOTP 應用） */
export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bits: number[] = [];
  for (const ch of clean) bits.push(...B32.indexOf(ch).toString(2).padStart(5, "0").split("").map(Number));
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, timeStep = 30, digits = 6, driftSeconds = 0): string {
  const counter = Math.floor((Date.now() / 1000 + driftSeconds) / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[off] & 0x7f) << 24) |
    (hmac[off + 1] << 16) |
    (hmac[off + 2] << 8) |
    hmac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** 驗證 TOTP 驗證碼（±1 個 30 秒步長，timing-safe 比較） */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const target = Buffer.from(code);
  for (let d = -window; d <= window; d++) {
    const candidate = Buffer.from(totp(secret, 30, 6, d * 30));
    if (candidate.length === target.length && timingSafeEqual(candidate, target)) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URI（供 Authenticator 應用掃描/手動輸入） */
export function totpUri(secret: string, email: string, issuer = "TAccounts"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
