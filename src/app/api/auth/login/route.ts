import { z } from "zod";
import { cookies } from "next/headers";
import { allowAttempt, clientIp, createSession, findUserByEmail, sessionCookieOptions, verifyPassword } from "@/server/auth";
import { handler, HttpError, json, readJson } from "@/server/http";

const schema = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

export const POST = handler(async (request) => {
  const ip = await clientIp();
  const { email, password } = await readJson(request, schema);
  if (!allowAttempt(`login:${ip}`, 20, 15 * 60 * 1000) || !allowAttempt(`login:${email}`, 10, 15 * 60 * 1000)) {
    throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.");
  }
  const user = findUserByEmail(email);
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.");
  const session = await createSession(user.id);
  (await cookies()).set({ ...sessionCookieOptions(session.expiresAt), value: session.token });
  const { passwordHash: _omit, ...safe } = user;
  void _omit;
  return json({ user: safe });
});
