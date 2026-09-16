"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, ArrowLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useLibrary } from "@/components/library-provider";
import { Button } from "@/components/ui/button";
import { communityClient } from "@/lib/community/client";
import type {
  CommunityAdmin,
  CommunityDiscussion,
  CommunityHome,
  CommunityCommand,
} from "@/lib/community/contracts";
import { JoinForm, PostComposer } from "./forms";
import { PostCard } from "./post-card";
import { ModerationPanel } from "./moderation-panel";

export function CommunityPage() {
  const { user, authLoading } = useLibrary();
  if (authLoading) return <p role="status">Opening community…</p>;
  if (!user) return <p>Sign in to visit the community pilot.</p>;
  // Account changes destroy all in-memory community data and unpublished drafts.
  return (
    <Suspense fallback={<p role="status">Opening community…</p>}>
      <CommunitySession key={user.id} userId={user.id} />
    </Suspense>
  );
}
function CommunitySession({ userId }: { userId: string }) {
  const search = useSearchParams().toString();
  const [home, setHome] = useState<CommunityHome | null>(null),
    [discussion, setDiscussion] = useState<CommunityDiscussion | null>(null),
    [admin, setAdmin] = useState<CommunityAdmin | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null),
    [threadId, setThreadId] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [desk, setDesk] = useState(false);
  const [connected, setConnected] = useState(true),
    [unreachable, setUnreachable] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const network = () => setConnected(navigator.onLine);
    queueMicrotask(network);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      const query = new URLSearchParams(search);
      setDiscussion(null);
      setRoomId(query.get("room"));
      setThreadId(query.get("thread"));
      const requestedPage = Number(query.get("page") ?? 0);
      setPage(
        Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 1000
          ? requestedPage
          : 0,
      );
      setDesk(false);
    });
  }, [search]);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setUnreachable(false);
      try {
        const info = await communityClient.home(userId, controller.signal);
        if (controller.signal.aborted) return;
        setHome(info);
        if (desk && info.admin) setAdmin(await communityClient.admin(userId, controller.signal));
        else if (roomId && (info.admin || (!info.paused && info.membership?.status === "active")))
          setDiscussion(
            await communityClient.discussion(userId, roomId, threadId, page, controller.signal),
          );
        else setDiscussion(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          // A transport failure must not unmount an open draft. Authorization
          // failures clear restricted content; a reconnect never publishes it.
          if (err instanceof TypeError) setUnreachable(true);
          else {
            setDiscussion(null);
            setAdmin(null);
          }
          setError(err instanceof Error ? err.message : "Could not load community.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [userId, connected, desk, roomId, threadId, page, revision]);
  const navigate = useCallback(
    (room: string | null, thread: string | null = null, nextPage = 0) => {
      setDiscussion(null);
      setRoomId(room);
      setThreadId(thread);
      setPage(nextPage);
      setDesk(false);
      const query = new URLSearchParams();
      if (room) query.set("room", room);
      if (thread) query.set("thread", thread);
      if (nextPage) query.set("page", String(nextPage));
      window.history.pushState(null, "", `/community${query.size ? `?${query}` : ""}`);
    },
    [],
  );
  const run = async (input: CommunityCommand) => {
    if (!connected || busy) return false;
    setBusy(true);
    setError("");
    try {
      await communityClient.command(userId, input);
      if (!mounted.current) return false;
      toast.success(
        input.action === "post"
          ? "Published to the community"
          : input.action === "report"
            ? "Report sent to moderators"
            : "Community updated",
      );
      if (input.action === "leave") navigate(null);
      if (input.action === "remove" && input.id === threadId) navigate(roomId);
      if (input.action === "post" && !input.parentId && page > 0) navigate(roomId);
      setRevision((value) => value + 1);
      return true;
    } catch (err) {
      if (mounted.current) {
        if (err instanceof TypeError) setUnreachable(true);
        setError(
          err instanceof Error
            ? err.message
            : "Could not save. Your draft is still here; retry when connected.",
        );
      }
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const active = home?.membership?.status === "active";
  const allowed = home?.admin || (!home?.paused && active);
  const disabled = busy || !connected || unreachable || loading;
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-brass">
            <MessageCircle className="size-4" aria-hidden />
            Community pilot
          </p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">The reading room</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Make room for another perspective. Small conversations about the books that stay with
            us.
          </p>
        </div>
        {home?.admin && (
          <Button
            variant="outline"
            onClick={() => {
              setDesk(!desk);
              setAdmin(null);
            }}
          >
            {desk ? "Back to rooms" : "Pilot desk"}
          </Button>
        )}
      </header>
      {(!connected || unreachable) && (
        <div role="status" className="rounded-xl border border-brass/30 bg-brass/5 p-4 text-sm">
          Community needs a connection to load and publish. An open draft stays in this view;
          reconnect before publishing. Your downloaded books remain available offline.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 p-4 text-sm"
        >
          <span>{error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
            disabled={!connected}
          >
            Retry loading
          </Button>
        </div>
      )}
      {home?.paused && (
        <p role="status" className="rounded-xl bg-muted p-4 text-sm">
          The community pilot is paused.{" "}
          {home.admin
            ? "Moderators can still review discussions and reports."
            : "Please check back later."}
        </p>
      )}
      {loading && connected && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading conversations…
        </p>
      )}
      {desk && home?.admin ? (
        admin && <ModerationPanel data={admin} paused={home.paused} busy={disabled} run={run} />
      ) : (
        <>
          {home &&
            !active &&
            (home.admin || (!home.paused && home.membership?.status === "invited")) && (
              <JoinForm run={run} busy={disabled} />
            )}
          {home && !allowed && home.membership?.status !== "invited" && !home.paused && (
            <section className="rounded-2xl border border-dashed p-8">
              <h2 className="font-serif text-2xl">A small circle, to start</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                {home.membership?.status === "suspended"
                  ? "Your community access is suspended. Contact a Shelf moderator if you need help."
                  : "We’re trying book conversations with a small group of invited Shelf readers. Ask a Shelf moderator for an invitation, then choose your community name here."}
              </p>
            </section>
          )}
          {allowed && !roomId && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl">Book rooms</h2>
                <span className="text-xs text-muted-foreground">Visible to pilot members</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {home?.rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => navigate(room.id)}
                    className="group min-w-0 rounded-2xl border bg-card p-6 text-left transition-colors hover:border-brass/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <BookOpen className="mb-5 size-6 text-brass" aria-hidden />
                    <h3 className="break-words font-serif text-2xl group-hover:text-brass">
                      {room.title}
                    </h3>
                    <p className="mt-2 break-words text-sm font-medium">
                      {room.bookTitle}{" "}
                      <span className="font-normal text-muted-foreground">· {room.author}</span>
                    </p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                      {room.description}
                    </p>
                    <p className="mt-5 text-xs text-muted-foreground">{room.threads} discussions</p>
                  </button>
                ))}
              </div>
              {!home?.rooms.length && (
                <div className="rounded-2xl border border-dashed p-8 text-center">
                  <p className="font-serif text-xl">The first conversation starts with a book.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {home?.admin
                      ? "Open the Pilot desk to create the first room."
                      : "Your hosts are preparing the first book rooms. Come back soon."}
                  </p>
                </div>
              )}
            </>
          )}
          {allowed && roomId && (
            <>
              <Button variant="ghost" onClick={() => navigate(threadId ? roomId : null)}>
                <ArrowLeft aria-hidden />
                {threadId ? "Back to book room" : "All book rooms"}
              </Button>
              {discussion && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {discussion.room.bookTitle} · {discussion.room.author}
                    </p>
                    <h2 className="mt-1 font-serif text-3xl">{discussion.room.title}</h2>
                  </div>
                  {discussion.thread && (
                    <PostCard
                      post={discussion.thread}
                      admin={!!home?.admin}
                      busy={disabled}
                      run={run}
                    />
                  )}
                  <div className="space-y-4">
                    {discussion.posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        admin={!!home?.admin}
                        busy={disabled}
                        run={run}
                        open={!threadId ? () => navigate(roomId, post.id) : undefined}
                      />
                    ))}
                  </div>
                  {!discussion.posts.length && (
                    <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      {threadId
                        ? "No replies yet. Add your perspective."
                        : "No discussions yet. Start with a question about the book."}
                    </p>
                  )}
                  {(page > 0 || discussion.hasMore) && (
                    <nav
                      aria-label="Discussion pages"
                      className="flex items-center justify-between"
                    >
                      <Button
                        variant="outline"
                        disabled={!page || loading}
                        onClick={() => navigate(roomId, threadId, page - 1)}
                      >
                        Previous
                      </Button>
                      <span className="text-sm">Page {page + 1}</span>
                      <Button
                        variant="outline"
                        disabled={!discussion.hasMore || loading}
                        onClick={() => navigate(roomId, threadId, page + 1)}
                      >
                        Next
                      </Button>
                    </nav>
                  )}
                  {active && !discussion.thread?.locked && !discussion.thread?.hidden && (
                    <PostComposer
                      key={`${roomId}:${threadId}`}
                      roomId={roomId}
                      parentId={threadId}
                      run={run}
                      disabled={disabled}
                    />
                  )}
                </>
              )}
            </>
          )}
          {active && !roomId && (
            <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-5 text-xs text-muted-foreground">
              <p>
                Participating as <strong>{home?.membership?.alias}</strong>. Your personal library
                stays private.
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  if (
                    window.confirm(
                      "Leave the community pilot? This removes your discussions and replies, including replies within discussions you started. Your personal library stays intact. A new invitation is needed to return.",
                    )
                  )
                    void run({ action: "leave" });
                }}
              >
                Leave pilot
              </Button>
            </footer>
          )}
        </>
      )}
    </div>
  );
}
