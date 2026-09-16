import { removeAccountUploads } from "@/server/sync/maintenance";
import { z } from "zod";
import { cookies } from "next/headers";
import { deleteAllSessions, findUserByEmail, SESSION_COOKIE, verifyPassword } from "@/server/auth";
import { getDb } from "@/server/db";
import { removeUserDir } from "@/server/files";
import { handler, HttpError, json, readJson, requireUser } from "@/server/http";

/** Permanently delete the signed-in account: rows cascade in SQLite, files are removed from disk. */
export const DELETE = handler(async (request) => {
  const user = await requireUser({ verified: false });
  const { password } = await readJson(request, z.object({ password: z.string().max(200) }));
  const record = findUserByEmail(user.email);
  if (!record || !(await verifyPassword(password, record.passwordHash))) throw new HttpError(403, "Password is incorrect.");
  removeAccountUploads(user.id);
  deleteAllSessions(user.id);
  getDb().prepare("DELETE FROM users WHERE id = ?").run(user.id);
  await removeUserDir(user.id);
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
