import { cookies } from "next/headers";
import { deleteSessionByToken, SESSION_COOKIE } from "@/server/auth";
import { handler, json } from "@/server/http";

export const POST = handler(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) deleteSessionByToken(token);
  jar.delete(SESSION_COOKIE);
  return json({ ok: true });
});
