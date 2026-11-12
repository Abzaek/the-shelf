import { z } from "zod";
import { allowAttempt, clientIp, createEmailToken, findUserByEmail } from "@/server/auth";
import { passwordResetEmail, sendEmail } from "@/server/email";
import { handler, HttpError, json, readJson } from "@/server/http";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });
const GENERIC_RESPONSE = { ok: true, message: "If an account exists for that email, a reset link will be sent." };

export const POST = handler(async (request) => {
  const { email } = await readJson(request, schema);
  const ip = await clientIp();
  if (!allowAttempt(`password-reset-ip:${ip}`, 10, 60 * 60 * 1000) || !allowAttempt(`password-reset-email:${email}`, 3, 60 * 60 * 1000)) {
    throw new HttpError(429, "Too many requests. Try again later.");
  }
  const user = findUserByEmail(email);
  if (user && !user.disabled) {
    const token = createEmailToken(user.id, "reset-password", 60 * 60 * 1000);
    try {
      await sendEmail(passwordResetEmail(user.email, user.displayName, token));
    } catch (error) {
      console.error("Password reset email failed:", error);
      // Keep the response indistinguishable from an unknown account.
    }
  }
  return json(GENERIC_RESPONSE);
});
