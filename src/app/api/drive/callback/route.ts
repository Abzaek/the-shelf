import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/server/http";
import { unseal } from "@/server/drive/crypto";
import { driveConfig, exchange, saveConnection } from "@/server/drive/client";
import { env } from "@/server/env";
export const GET = handler(async (request) => {
  const user = await requireUser();
  const jar = await cookies(),
    encrypted = jar.get("shelf_drive_oauth")?.value;
  jar.set("shelf_drive_oauth", "", { path: "/api/drive", maxAge: 0 });
  if (!encrypted)
    throw new HttpError(400, "Drive connection expired. Please try again from Settings.");
  let state: { nonce: string; verifier: string; userId: string; expires: number };
  try {
    state = unseal(encrypted);
  } catch {
    throw new HttpError(400, "Invalid Drive connection request.");
  }
  const query = new URL(request.url).searchParams;
  if (state.userId !== user.id || state.expires < Date.now() || query.get("state") !== state.nonce)
    throw new HttpError(400, "Drive connection expired or account changed.");
  if (query.has("error")) return NextResponse.redirect(`${env.appUrl}/settings?drive=cancelled`);
  const code = query.get("code");
  if (!code) throw new HttpError(400, "Missing authorization code.");
  const tokens = await exchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: driveConfig().redirectUri,
    code_verifier: state.verifier,
  });
  if (!tokens.refresh_token)
    throw new HttpError(409, "Reconnect Drive and allow access to selected files.");
  saveConnection(user.id, {
    ...tokens,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  });
  return NextResponse.redirect(`${env.appUrl}/settings?drive=connected`);
});
