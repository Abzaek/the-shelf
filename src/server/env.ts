import "server-only";
import path from "node:path";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

/** Server configuration. All values come from the environment with sane dev defaults. */
export const env = {
  /** Directory holding the SQLite database and every user's files. */
  dataDir: process.env.SHELF_DATA_DIR ?? path.join(process.cwd(), ".data"),
  /** Secret used to sign session cookies. Required in production. */
  sessionSecret: process.env.SHELF_SESSION_SECRET ?? "",
  /** Whole-store hard cap in bytes (all users). Default 10 GB. */
  totalQuotaBytes: int("SHELF_TOTAL_QUOTA_BYTES", 10 * 1024 ** 3),
  /** Per-user cap in bytes. Default 250 MB. */
  userQuotaBytes: int("SHELF_USER_QUOTA_BYTES", 250 * 1024 ** 2),
  /** Largest single upload accepted. Default = user quota. */
  maxUploadBytes: int("SHELF_MAX_UPLOAD_BYTES", int("SHELF_USER_QUOTA_BYTES", 250 * 1024 ** 2)),
  /** Refuse uploads when the disk holding dataDir has less free space than this. Default 1 GB. */
  minFreeDiskBytes: int("SHELF_MIN_FREE_DISK_BYTES", 1024 ** 3),
  /** Allow anyone to create an account. */
  registrationOpen: (process.env.SHELF_REGISTRATION ?? "open") !== "closed",
  sessionDays: int("SHELF_SESSION_DAYS", 30),
  /** This account is always the super admin: manages admins, cannot be demoted or disabled. */
  superAdminEmail: (process.env.SHELF_SUPERADMIN_EMAIL ?? "abzaeko@gmail.com").trim().toLowerCase(),
  isProduction: process.env.NODE_ENV === "production",
  /** Public origin used in emails, e.g. https://shelf.abzaek.dev */
  appUrl: (process.env.SHELF_APP_URL ?? (process.env.NODE_ENV === "production" ? "https://shelf.abzaek.dev" : "http://localhost:3000")).replace(/\/$/, ""),
  /** Resend API key. When absent, emails are logged to the server console instead. */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.SHELF_EMAIL_FROM ?? "The Shelf <shelf@abzaek.dev>",
  /** Gate the library behind a verified email. Defaults to on when Resend is configured. */
  requireEmailVerification: process.env.SHELF_REQUIRE_EMAIL_VERIFICATION
    ? process.env.SHELF_REQUIRE_EMAIL_VERIFICATION !== "false"
    : !!process.env.RESEND_API_KEY,
};

/** Called on first real request (not at build time) so misconfiguration fails loudly. */
export function assertRuntimeConfig(): void {
  if (env.isProduction && env.sessionSecret.length < 32) {
    throw new Error("SHELF_SESSION_SECRET must be set (>= 32 chars) in production.");
  }
}
