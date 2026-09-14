import { adminUsers, audit } from "@/server/admin";
import { handler, HttpError, json, requireAdmin, type RouteParams } from "@/server/http";

/** Sign the user out everywhere. */
export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const actor = await requireAdmin();
  const { id } = await params;
  const target = adminUsers.get(id);
  if (!target) throw new HttpError(404, "User not found.");
  if (target.role === "superadmin" && actor.id !== target.id) throw new HttpError(403, "The super admin account can't be changed here.");
  if (actor.role !== "superadmin" && target.role === "admin" && actor.id !== target.id) throw new HttpError(403, "Only the super admin can manage admins.");
  adminUsers.revokeSessions(id);
  audit(actor, "user.revoke_sessions", target);
  return json({ ok: true });
});
