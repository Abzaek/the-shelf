import { getCurrentUser } from "@/server/auth";
import { env } from "@/server/env";
import { isRegistrationOpen } from "@/server/admin";
import { userUsage } from "@/server/files";
import { handler, json } from "@/server/http";

export const GET = handler(async () => {
  const user = await getCurrentUser();
  return json({
    user,
    usage: user ? userUsage(user.id, user.quotaBytes) : null,
    registrationOpen: isRegistrationOpen(),
    emailVerificationRequired: env.requireEmailVerification,
  });
});
