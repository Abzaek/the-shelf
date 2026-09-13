import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getDb, now } from "./db";
import { assertRuntimeConfig, env } from "./env";
import { createId } from "@/lib/utils/id";

const SCRYPT = { N: 16384, r: 8, p: 1 };
function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))),
  );
}
export const SESSION_COOKIE = "shelf_session";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  quotaBytes: number;
  emailVerified: boolean;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  quota_bytes: number | null;
  email_verified_at: string | null;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role === "admin" ? "admin" : "user",
    quotaBytes: row.quota_bytes ?? env.userQuotaBytes,
    emailVerified: !!row.email_verified_at,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------- passwords

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), salt, expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ------------------------------------------------------------- users

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as UserRow | undefined;
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

export function findUserById(id: string): User | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export async function createUser(email: string, password: string, displayName = ""): Promise<User> {
  const db = getDb();
  const id = createId();
  const ts = now();
  const count = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  // The very first account administers the instance.
  const role = count === 0 ? "admin" : "user";
  // Without an email provider there is no way to verify, so accounts start verified.
  const verifiedAt = env.requireEmailVerification ? null : ts;
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, email_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, normalizeEmail(email), await hashPassword(password), displayName.trim(), role, verifiedAt, ts, ts);
  return findUserById(id)!;
}

export function markEmailVerified(userId: string): void {
  getDb().prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?").run(now(), now(), userId);
}

// ------------------------------------------------------------- email tokens

export type EmailTokenPurpose = "verify";

/** Creates a single-use token (returned raw; only its hash is stored). Older tokens for the purpose are invalidated. */
export function createEmailToken(userId: string, purpose: EmailTokenPurpose, ttlMs = 24 * 3_600_000): string {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  db.prepare("UPDATE email_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL").run(now(), userId, purpose);
  db.prepare(
    "INSERT INTO email_tokens (id, user_id, purpose, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(createId(), userId, purpose, hashToken(token), now(), new Date(Date.now() + ttlMs).toISOString());
  return token;
}

/** Consumes a token; returns the user id or null when unknown, expired or already used. */
export function consumeEmailToken(token: string, purpose: EmailTokenPurpose): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, user_id, expires_at, consumed_at FROM email_tokens WHERE token_hash = ? AND purpose = ?")
    .get(hashToken(token), purpose) as { id: string; user_id: string; expires_at: string; consumed_at: string | null } | undefined;
  if (!row || row.consumed_at || row.expires_at < now()) return null;
  db.prepare("UPDATE email_tokens SET consumed_at = ? WHERE id = ?").run(now(), row.id);
  db.prepare("DELETE FROM email_tokens WHERE expires_at < ?").run(now());
  return row.user_id;
}

export function countUsers(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

// ------------------------------------------------------------- sessions

function hashToken(token: string): string {
  assertRuntimeConfig();
  return createHash("sha256").update(token + env.sessionSecret).digest("base64url");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const ts = now();
  const expiresAt = new Date(Date.now() + env.sessionDays * 86_400_000).toISOString();
  const ua = ((await headers()).get("user-agent") ?? "").slice(0, 200);
  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(createId(), userId, hashToken(token), ts, expiresAt, ts, ua);
  return { token, expiresAt };
}

export function deleteSessionByToken(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function deleteAllSessions(userId: string): void {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** Resolve the current user from the session cookie; null when signed out or expired. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.last_seen_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as (UserRow & { session_id: string; expires_at: string; last_seen_at: string }) | undefined;
  if (!row) return null;
  if (row.expires_at < now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.session_id);
    return null;
  }
  // Sliding expiry, refreshed at most once an hour.
  if (Date.parse(row.last_seen_at) < Date.now() - 3_600_000) {
    db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").run(
      now(),
      new Date(Date.now() + env.sessionDays * 86_400_000).toISOString(),
      row.session_id,
    );
  }
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  return toUser(row);
}

export function sessionCookieOptions(expiresAt: string) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProduction,
    path: "/",
    expires: new Date(expiresAt),
  };
}

// ------------------------------------------------------------- rate limiting

const attempts = new Map<string, { count: number; resetAt: number }>();

/** Simple fixed-window limiter (per process). Returns false when the caller must back off. */
export function allowAttempt(key: string, limit: number, windowMs: number): boolean {
  const nowMs = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < nowMs) {
    attempts.set(key, { count: 1, resetAt: nowMs + windowMs });
    return true;
  }
  entry.count += 1;
  if (attempts.size > 10_000) attempts.clear();
  return entry.count <= limit;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}
