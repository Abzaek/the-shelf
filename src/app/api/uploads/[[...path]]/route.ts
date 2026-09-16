import { uploadServer } from "@/server/sync/uploads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = (request: Request) => uploadServer().handleWeb(request);
export { handle as POST, handle as PATCH, handle as HEAD, handle as OPTIONS };
