import "server-only";
import fsp from "node:fs/promises";
import { getDb, now } from "./db";
import { env } from "./env";
import { removeUserDir } from "./files";
import type { Role, User } from "./auth";

export interface AdminUser extends User {
  lastSeenAt: string | null;
  bookCount: number;
  usedBytes: number;
  sessionCount: number;
}

interface Row {
  id: string; email: string; display_name: string; role: string; quota_bytes: number | null;
  email_verified_at: string | null; disabled_at: string | null; created_at: string; last_seen_at: string | null;
  book_count: number; used_bytes: number; session_count: number;
}

const SELECT = `
  SELECT u.id, u.email, u.display_name, u.role, u.quota_bytes, u.email_verified_at, u.disabled_at, u.created_at, u.last_seen_at,
    (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id) AS book_count,
    (SELECT COALESCE(SUM(file_size + cover_size), 0) FROM books b WHERE b.user_id = u.id) AS used_bytes,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS session_count
  FROM users u`;

function toAdminUser(r: Row): AdminUser {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: (r.role === "superadmin" ? "superadmin" : r.role === "admin" ? "admin" : "user") as Role,
    quotaBytes: r.quota_bytes ?? env.userQuotaBytes,
    emailVerified: !!r.email_verified_at,
    disabled: !!r.disabled_at,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    bookCount: r.book_count,
    usedBytes: r.used_bytes,
    sessionCount: r.session_count,
  };
}

export const adminUsers = {
  list(): AdminUser[] {
    return (getDb().prepare(`${SELECT} ORDER BY CASE u.role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.created_at`).all(now()) as Row[]).map(toAdminUser);
  },
  get(id: string): AdminUser | null {
    const row = getDb().prepare(`${SELECT} WHERE u.id = ?`).get(now(), id) as Row | undefined;
    return row ? toAdminUser(row) : null;
  },
  setRole(id: string, role: Exclude<Role, "superadmin">): void {
    getDb().prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ? AND role <> 'superadmin'").run(role, now(), id);
  },
  setQuota(id: string, quotaBytes: number | null): void {
    getDb().prepare("UPDATE users SET quota_bytes = ?, updated_at = ? WHERE id = ?").run(quotaBytes, now(), id);
  },
  setDisabled(id: string, disabled: boolean): void {
    const db = getDb();
    db.prepare("UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ? AND role <> 'superadmin'").run(disabled ? now() : null, now(), id);
    if (disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  },
  setVerified(id: string): void {
    getDb().prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?").run(now(), now(), id);
  },
  revokeSessions(id: string): void {
    getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  },
  async remove(id: string): Promise<void> {
    getDb().prepare("DELETE FROM users WHERE id = ? AND role <> 'superadmin'").run(id);
    await removeUserDir(id);
  },
};

export interface Overview {
  users: number;
  admins: number;
  disabled: number;
  unverified: number;
  books: number;
  usedBytes: number;
  totalQuotaBytes: number;
  diskFreeBytes: number | null;
  activeSessions: number;
  registrationOpen: boolean;
  emailConfigured: boolean;
  requireEmailVerification: boolean;
  superAdminEmail: string;
}

export async function overview(): Promise<Overview> {
  const db = getDb();
  const one = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  let diskFreeBytes: number | null = null;
  try {
    const st = await fsp.statfs(env.dataDir);
    diskFreeBytes = Number(st.bavail) * Number(st.bsize);
  } catch {
    diskFreeBytes = null;
  }
  return {
    users: one("SELECT COUNT(*) AS n FROM users"),
    admins: one("SELECT COUNT(*) AS n FROM users WHERE role IN ('admin','superadmin')"),
    disabled: one("SELECT COUNT(*) AS n FROM users WHERE disabled_at IS NOT NULL"),
    unverified: one("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NULL"),
    books: one("SELECT COUNT(*) AS n FROM books"),
    usedBytes: one("SELECT COALESCE(SUM(file_size + cover_size), 0) AS n FROM books"),
    totalQuotaBytes: env.totalQuotaBytes,
    diskFreeBytes,
    activeSessions: one("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?", now()),
    registrationOpen: isRegistrationOpen(),
    emailConfigured: !!env.resendApiKey,
    requireEmailVerification: env.requireEmailVerification,
    superAdminEmail: env.superAdminEmail,
  };
}

// ---------------------------------------------------------------- instance settings

export function getInstanceSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM instance_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setInstanceSetting(key: string, value: string): void {
  getDb().prepare("INSERT INTO instance_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, value, now());
}

/** Runtime toggle overrides the env default. */
export function isRegistrationOpen(): boolean {
  const v = getInstanceSetting("registration");
  return v === null ? env.registrationOpen : v === "open";
}

// ---------------------------------------------------------------- audit

export interface AuditEntry {
  id: number;
  actorEmail: string;
  action: string;
  targetEmail: string | null;
  detail: string;
  createdAt: string;
}

export function audit(actor: User, action: string, target?: { id: string; email: string } | null, detail = ""): void {
  getDb()
    .prepare("INSERT INTO admin_audit (actor_id, actor_email, action, target_id, target_email, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(actor.id, actor.email, action, target?.id ?? null, target?.email ?? null, detail, now());
}

export function recentAudit(limit = 50): AuditEntry[] {
  return (getDb().prepare("SELECT id, actor_email, action, target_email, detail, created_at FROM admin_audit ORDER BY id DESC LIMIT ?").all(limit) as
    { id: number; actor_email: string; action: string; target_email: string | null; detail: string; created_at: string }[]).map((r) => ({
    id: r.id, actorEmail: r.actor_email, action: r.action, targetEmail: r.target_email, detail: r.detail, createdAt: r.created_at,
  }));
}
