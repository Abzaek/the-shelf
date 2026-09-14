import { z } from "zod";
import { audit, isRegistrationOpen, setInstanceSetting } from "@/server/admin";
import { handler, json, readJson, requireAdmin } from "@/server/http";

export const GET = handler(async () => {
  await requireAdmin();
  return json({ registrationOpen: isRegistrationOpen() });
});

export const PATCH = handler(async (request) => {
  const actor = await requireAdmin();
  const { registrationOpen } = await readJson(request, z.object({ registrationOpen: z.boolean() }));
  setInstanceSetting("registration", registrationOpen ? "open" : "closed");
  audit(actor, registrationOpen ? "registration.open" : "registration.close");
  return json({ registrationOpen: isRegistrationOpen() });
});
