import { adminUsers } from "@/server/admin";
import { handler, json, requireAdmin } from "@/server/http";

export const GET = handler(async () => {
  await requireAdmin();
  return json({ users: adminUsers.list() });
});
