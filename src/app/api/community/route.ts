import { z } from "zod";
import { handler, json, readJson, requireUser, HttpError } from "@/server/http";
import { assertSameOrigin } from "@/server/sync/security";
import { communityCommand } from "@/lib/community/contracts";
import { command } from "@/server/community/commands";
import { home, discussion, moderation } from "@/server/community/queries";
const query = z.object({
  view: z.enum(["home", "discussion", "admin"]).default("home"),
  roomId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});
async function actor(request: Request) {
  assertSameOrigin(request);
  const user = await requireUser();
  if (request.headers.get("x-shelf-user") !== user.id)
    throw new HttpError(401, "Your account changed. Reload community to continue.");
  return user;
}
// Include no-store on failures as well as successful membership-restricted responses.
function privateHandler(fn: (request: Request) => Promise<Response>) {
  const wrapped = handler(fn);
  return async (request: Request) => {
    const response = await wrapped(request, undefined);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
}
export const GET = privateHandler(async (request) => {
  const user = await actor(request);
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new HttpError(400, "Invalid community query.");
  const { view, roomId, threadId, page } = parsed.data;
  return json(
    view === "home"
      ? home(user)
      : view === "admin"
        ? moderation(user)
        : discussion(user, roomId ?? null, threadId ?? null, page),
  );
});
export const POST = privateHandler(async (request) => {
  const user = await actor(request);
  return json(command(user, await readJson(request, communityCommand, 32000)));
});
