/**
 * MFA secret 伺服器端加密（AES-256-GCM）
 * TOTP secret 明文永不落庫：產生後立即以環境變數金鑰加密，
 * 資料庫只存 { iv, tag, ciphertext }。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type MfaSecretBlob = { iv: string; tag: string; ciphertext: string };

function key(): Buffer {
  const k = process.env.MFA_ENC_KEY;
  if (!k) throw new Error("缺少 MFA_ENC_KEY 環境變數");
  return Buffer.from(k, "base64");
}

export function encryptMfaSecret(secret: string): MfaSecretBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ct.toString("base64"),
  };
}

export function decryptMfaSecret(blob: MfaSecretBlob): string {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
