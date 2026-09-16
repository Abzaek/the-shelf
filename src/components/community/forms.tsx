"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { COMMUNITY_RULES, type CommunityCommand } from "@/lib/community/contracts";
export type RunCommand = (input: CommunityCommand) => Promise<boolean>;
export const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
/** Stable across a failed attempt; only a changed draft gets a new operation ID. */
function useOperationId() {
  const operation = useRef({ body: "", id: "" });
  const idFor = (body: unknown) => {
    const serialized = JSON.stringify(body);
    if (operation.current.body !== serialized)
      operation.current = { body: serialized, id: crypto.randomUUID() };
    return operation.current.id;
  };
  return {
    idFor,
    reset: () => {
      operation.current = { body: "", id: "" };
    },
  };
}
export function JoinForm({ run, busy }: { run: RunCommand; busy: boolean }) {
  const [alias, setAlias] = useState("");
  const [accepted, setAccepted] = useState(false);
  return (
    <form
      className="max-w-xl space-y-4 rounded-2xl border bg-card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        await run({ action: "join", alias, acceptRules: true });
      }}
    >
      <h2 className="font-serif text-2xl">Take a seat</h2>
      <p className="text-sm text-muted-foreground">
        Choose a name other pilot members will see. Joining shares only this name and the
        discussions you choose to publish. Your email, library, files, and private notes stay
        private.
      </p>
      <label className="block text-sm">
        Community name
        <input
          className={`${fieldClass} mt-2`}
          value={alias}
          maxLength={40}
          required
          onChange={(e) => setAlias(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="text-sm text-muted-foreground">{COMMUNITY_RULES}</p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          required
        />
        I agree to the community rules and to sharing my posts with pilot members.
      </label>
      <Button disabled={busy || !accepted || !alias.trim()}>Join the pilot</Button>
    </form>
  );
}
export function PostComposer({
  roomId,
  parentId,
  run,
  disabled,
}: {
  roomId: string;
  parentId: string | null;
  run: RunCommand;
  disabled: boolean;
}) {
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [spoiler, setSpoiler] = useState(false);
  const operationId = useOperationId();
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = { action: "post" as const, roomId, parentId, title, body, spoiler };
        if (await run({ ...value, id: operationId.idFor(value) })) {
          operationId.reset();
          setTitle("");
          setBody("");
          setSpoiler(false);
        }
      }}
    >
      <h2 className="font-serif text-xl">
        {parentId ? "Join the conversation" : "Start a discussion"}
      </h2>
      {!parentId && (
        <div>
          <label className="block text-sm">
            Discussion title
            <input
              className={`${fieldClass} mt-2`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={140}
              aria-describedby="community-title-help"
              placeholder="A question, a passage, a different perspective…"
            />
          </label>
          <p id="community-title-help" className="mt-1 block text-xs text-muted-foreground">
            Keep the title free of spoilers.
          </p>
        </div>
      )}
      <label className="block text-sm">
        {parentId ? "Your reply" : "Your thoughts"}
        <textarea
          className={`${fieldClass} mt-2 min-h-32`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={4000}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />
          Contains spoilers
        </label>
        <span className="text-xs text-muted-foreground">{body.length}/4000</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Visible to all pilot members. Publishing needs a connection; drafts stay in this view until
        you leave or reload.
      </p>
      <Button disabled={disabled || !body.trim() || (!parentId && !title.trim())}>
        {parentId ? "Publish reply" : "Publish discussion"}
      </Button>
    </form>
  );
}
export function RoomForm({ run, busy }: { run: RunCommand; busy: boolean }) {
  const [title, setTitle] = useState(""),
    [bookTitle, setBookTitle] = useState(""),
    [author, setAuthor] = useState(""),
    [description, setDescription] = useState("");
  const operationId = useOperationId();
  return (
    <form
      className="space-y-3 rounded-xl border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = { action: "room" as const, title, bookTitle, author, description };
        if (await run({ ...value, id: operationId.idFor(value) })) {
          operationId.reset();
          setTitle("");
          setBookTitle("");
          setAuthor("");
          setDescription("");
        }
      }}
    >
      <h3 className="font-serif text-xl">Create a book room</h3>
      <p className="text-xs text-muted-foreground">
        Enter public book details. Creating a room does not share any uploaded book.
      </p>
      <label className="block text-sm">
        Room name
        <input
          className={`${fieldClass} mt-1`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={100}
        />
      </label>
      <label className="block text-sm">
        Book title
        <input
          className={`${fieldClass} mt-1`}
          value={bookTitle}
          onChange={(e) => setBookTitle(e.target.value)}
          required
          maxLength={160}
        />
      </label>
      <label className="block text-sm">
        Book author
        <input
          className={`${fieldClass} mt-1`}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          required
          maxLength={100}
        />
      </label>
      <label className="block text-sm">
        Opening prompt
        <textarea
          className={`${fieldClass} mt-1`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={600}
        />
      </label>
      <Button disabled={busy}>Create room</Button>
    </form>
  );
}
