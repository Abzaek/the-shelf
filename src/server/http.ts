import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, type User } from "./auth";
import { QuotaError } from "./files";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Resolve the signed-in user or throw 401. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

/** Parse and validate a JSON body; throws 400 on failure. */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return parsed.data;
}

/** Wrap a route handler so thrown HttpError / QuotaError become proper responses. */
export function handler<Ctx>(fn: (request: Request, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(request, ctx);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      if (err instanceof QuotaError) return fail(err.status, err.message);
      console.error(err);
      return fail(500, "Something went wrong on the server.");
    }
  };
}

export type RouteParams<T extends string> = { params: Promise<Record<T, string>> };
