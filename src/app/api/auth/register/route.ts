import { z } from "zod";
import { cookies } from "next/headers";
import { allowAttempt, clientIp, createEmailToken, createSession, createUser, findUserByEmail, sessionCookieOptions } from "@/server/auth";
import { sendEmail, verificationEmail } from "@/server/email";
import { isRegistrationOpen } from "@/server/admin";
import { handler, HttpError, json, readJson } from "@/server/http";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
  displayName: z.string().trim().max(80).optional().default(""),
});

export const POST = handler(async (request) => {
  if (!isRegistrationOpen()) throw new HttpError(403, "Registration is closed.");
  if (!allowAttempt(`register:${await clientIp()}`, 5, 60 * 60 * 1000)) throw new HttpError(429, "Too many sign-ups from this address. Try later.");
  const { email, password, displayName } = await readJson(request, schema);
  if (findUserByEmail(email)) throw new HttpError(409, "An account with that email already exists.");
  const user = await createUser(email, password, displayName);
  if (!user.emailVerified) {
    try {
      await sendEmail(verificationEmail(user.email, user.displayName, createEmailToken(user.id, "verify")));
    } catch (err) {
      console.error("Verification email failed:", err);
      // Account exists; the user can request another email from the verify screen.
    }
  }
  const session = await createSession(user.id);
  (await cookies()).set({ ...sessionCookieOptions(session.expiresAt), value: session.token });
  return json({ user }, { status: 201 });
});
