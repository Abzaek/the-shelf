import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { handler, HttpError, json } from "@/server/http";
import { requireDeviceUser } from "@/server/sync/security";
import { driveConfig, driveConfigured } from "@/server/drive/client";
import { seal } from "@/server/drive/crypto";
import { env } from "@/server/env";
export const POST = handler(async (request) => {
  const user = await requireDeviceUser(request);
  if (!driveConfigured())
    throw new HttpError(503, "Drive connections are not enabled on this Shelf yet.");
  const nonce = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url");
  (await cookies()).set(
    "shelf_drive_oauth",
    seal({ nonce, verifier, userId: user.id, expires: Date.now() + 600000 }),
    { httpOnly: true, secure: env.isProduction, sameSite: "lax", path: "/api/drive", maxAge: 600 },
  );
  const config = driveConfig();
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    state: nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  return json(
    { url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` },
    { headers: { "Cache-Control": "no-store" } },
  );
});
