import "server-only";
import type { User } from "@/server/auth";
import { getDb } from "@/server/db";
import { HttpError } from "@/server/http";
import { getInstanceSetting } from "@/server/admin";
import type { Membership } from "@/lib/community/contracts";
export const isModerator = (user: User) => user.role === "admin" || user.role === "superadmin";
export const pilotPaused = () => getInstanceSetting("community_paused") === "true";
export function membership(userId: string): Membership | null {
  return (
    (getDb().prepare("SELECT status, alias FROM community_members WHERE user_id=?").get(userId) as
      Membership | undefined) ?? null
  );
}
export function requireModerator(user: User) {
  if (!isModerator(user)) throw new HttpError(403, "Moderator access required.");
}
export function requireParticipant(user: User, writing = false) {
  if (pilotPaused() && !isModerator(user))
    throw new HttpError(403, "The community pilot is paused.");
  if ((!isModerator(user) || writing) && membership(user.id)?.status !== "active")
    throw new HttpError(403, "Join the invited community pilot to continue.");
}
export function noteVisit(user: User) {
  if (membership(user.id)?.status !== "active") return;
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO community_visits(user_id,day) VALUES (?,date('now'))").run(
    user.id,
  );
  db.prepare("DELETE FROM community_visits WHERE day < date('now','-90 days')").run();
}
