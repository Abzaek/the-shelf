import "server-only";
import { HttpError, requireUser } from "@/server/http";
import { env } from "@/server/env";
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = env.isProduction ? new URL(env.appUrl).origin : new URL(request.url).origin;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expected))
    throw new HttpError(403, "Cross-origin request rejected.");
}
export async function requireDeviceUser(request: Request) {
  assertSameOrigin(request);
  const user = await requireUser();
  if (request.headers.get("x-shelf-user") !== user.id)
    throw new HttpError(401, "Sign in to the account for this device library.");
  return user;
}
