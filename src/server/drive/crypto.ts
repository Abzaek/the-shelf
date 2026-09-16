import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key(): Buffer {
  const value = Buffer.from(process.env.SHELF_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (value.length !== 32)
    throw new Error("SHELF_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return value;
}
export function seal(value: unknown): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function unseal<T>(value: string): T {
  const buffer = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8"),
  ) as T;
}
