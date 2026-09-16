import type {
  CommunityCommand,
  CommunityHome,
  CommunityDiscussion,
  CommunityAdmin,
} from "./contracts";
async function request<T>(
  userId: string,
  query: string,
  command?: CommunityCommand,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 8000);
  try {
    const response = await fetch(`/api/community${query}`, {
      method: command ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "X-Shelf-User": userId,
        ...(command ? { "Content-Type": "application/json" } : {}),
      },
      body: command ? JSON.stringify(command) : undefined,
    });
    if (response.status >= 500)
      throw new TypeError("Community is temporarily unavailable. Please retry.");
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error ?? "Community could not be loaded.");
    return data as T;
  } catch (error) {
    // A timeout may follow a successful server commit. Keep the operation ID
    // and draft so an explicit retry is safe; never publish automatically.
    if (timedOut)
      throw new TypeError("Community did not respond. Check your connection and retry.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
export const communityClient = {
  home: (userId: string, signal?: AbortSignal) =>
    request<CommunityHome>(userId, "", undefined, signal),
  discussion: (
    userId: string,
    roomId: string,
    threadId: string | null,
    page: number,
    signal?: AbortSignal,
  ) =>
    request<CommunityDiscussion>(
      userId,
      `?view=discussion&roomId=${encodeURIComponent(roomId)}${threadId ? `&threadId=${encodeURIComponent(threadId)}` : ""}&page=${page}`,
      undefined,
      signal,
    ),
  admin: (userId: string, signal?: AbortSignal) =>
    request<CommunityAdmin>(userId, "?view=admin", undefined, signal),
  command: (userId: string, input: CommunityCommand) => request<{ id?: string }>(userId, "", input),
};
