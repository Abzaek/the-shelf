import { z } from "zod";
import { consumeEmailToken, findUserById, markEmailVerified } from "@/server/auth";
import { handler, HttpError, json, readJson } from "@/server/http";

/** Confirms an email address from the link in the verification message. */
export const POST = handler(async (request) => {
  const { token } = await readJson(request, z.object({ token: z.string().min(16).max(200) }));
  const userId = consumeEmailToken(token, "verify");
  if (!userId) throw new HttpError(400, "This link is invalid or has expired. Request a new one.");
  markEmailVerified(userId);
  return json({ user: findUserById(userId) });
});
