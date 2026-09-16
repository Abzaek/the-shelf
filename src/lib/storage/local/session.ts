import type { SessionInfo } from "@/lib/auth-client";
const SESSION = "shelf-offline-session-v1",
  LOCK = "shelf-signed-out-v1";
/** Identity only, never a token or an authorization decision. APIs still authenticate every request. */
export function cachedSession(): SessionInfo | null {
  if (localStorage.getItem(LOCK)) return null;
  try {
    const value = JSON.parse(localStorage.getItem(SESSION) ?? "null") as SessionInfo | null;
    return value?.user?.id && (!value.emailVerificationRequired || value.user.emailVerified)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function saveSession(info: SessionInfo) {
  if (info.user) localStorage.setItem(SESSION, JSON.stringify(info));
}
export function isLocallySignedOut() {
  return !!localStorage.getItem(LOCK);
}
export function lockSession() {
  localStorage.setItem(LOCK, "1");
  localStorage.removeItem(SESSION);
}
export function unlockSession() {
  localStorage.removeItem(LOCK);
}
