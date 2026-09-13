import { userUsage } from "@/server/files";
import { handler, json, requireUser } from "@/server/http";

export const GET = handler(async () => {
  const user = await requireUser();
  return json(userUsage(user.id, user.quotaBytes));
});
