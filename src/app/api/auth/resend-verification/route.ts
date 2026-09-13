import { allowAttempt, createEmailToken } from "@/server/auth";
import { sendEmail, verificationEmail } from "@/server/email";
import { handler, HttpError, json, requireUser } from "@/server/http";

export const POST = handler(async () => {
  const user = await requireUser({ verified: false });
  if (user.emailVerified) return json({ ok: true, alreadyVerified: true });
  if (!allowAttempt(`verify-resend:${user.id}`, 3, 60 * 60 * 1000)) {
    throw new HttpError(429, "A few emails were already sent. Check your spam folder or try again in an hour.");
  }
  await sendEmail(verificationEmail(user.email, user.displayName, createEmailToken(user.id, "verify")));
  return json({ ok: true });
});
