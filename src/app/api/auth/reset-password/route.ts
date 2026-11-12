import { z } from "zod";
import { allowAttempt, clientIp, resetPasswordWithToken } from "@/server/auth";
import { handler, HttpError, json, readJson } from "@/server/http";

export const POST = handler(async (request) => {
  if (!allowAttempt(`password-reset-complete:${await clientIp()}`, 10, 60 * 60 * 1000)) {
    throw new HttpError(429, "Too many attempts. Try again later.");
  }
  const { token, password } = await readJson(
    request,
    z.object({ token: z.string().min(16).max(200), password: z.string().min(10, "Use at least 10 characters.").max(200) }),
  );
  if (!(await resetPasswordWithToken(token, password))) {
    throw new HttpError(400, "This link is invalid or has expired. Request a new one.");
  }
  return json({ ok: true });
});
