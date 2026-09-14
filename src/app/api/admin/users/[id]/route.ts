import { z } from "zod";
import { adminUsers, audit } from "@/server/admin";
import { handler, HttpError, json, readJson, requireAdmin, type RouteParams } from "@/server/http";
import type { User } from "@/server/auth";

const schema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  /** null resets to the instance default */
  quotaBytes: z.number().int().min(0).max(1024 ** 4).nullable().optional(),
  disabled: z.boolean().optional(),
  emailVerified: z.literal(true).optional(),
});

/**
 * Who may touch whom:
 *  - nobody edits the super admin
 *  - only the super admin edits admins or changes roles
 *  - admins edit regular users
 */
function assertCanManage(actor: User, target: { id: string; role: string }, changingRole: boolean) {
  if (target.role === "superadmin") throw new HttpError(403, "The super admin account can't be changed here.");
  if (actor.id === target.id) throw new HttpError(400, "Use Settings to change your own account.");
  if (actor.role !== "superadmin" && (target.role === "admin" || changingRole)) {
    throw new HttpError(403, "Only the super admin can manage admins.");
  }
}

export const PATCH = handler(async (request, { params }: RouteParams<"id">) => {
  const actor = await requireAdmin();
  const { id } = await params;
  const target = adminUsers.get(id);
  if (!target) throw new HttpError(404, "User not found.");
  const patch = await readJson(request, schema);
  assertCanManage(actor, target, patch.role !== undefined);

  if (patch.role !== undefined && patch.role !== target.role) {
    adminUsers.setRole(id, patch.role);
    audit(actor, patch.role === "admin" ? "user.promote" : "user.demote", target);
  }
  if (patch.quotaBytes !== undefined) {
    adminUsers.setQuota(id, patch.quotaBytes);
    audit(actor, "user.quota", target, patch.quotaBytes === null ? "default" : String(patch.quotaBytes));
  }
  if (patch.disabled !== undefined && patch.disabled !== target.disabled) {
    adminUsers.setDisabled(id, patch.disabled);
    audit(actor, patch.disabled ? "user.disable" : "user.enable", target);
  }
  if (patch.emailVerified && !target.emailVerified) {
    adminUsers.setVerified(id);
    audit(actor, "user.verify", target);
  }
  return json({ user: adminUsers.get(id) });
});

export const DELETE = handler(async (_request, { params }: RouteParams<"id">) => {
  const actor = await requireAdmin();
  const { id } = await params;
  const target = adminUsers.get(id);
  if (!target) throw new HttpError(404, "User not found.");
  assertCanManage(actor, target, false);
  await adminUsers.remove(id);
  audit(actor, "user.delete", target, `${target.bookCount} books, ${target.usedBytes} bytes`);
  return json({ ok: true });
});
