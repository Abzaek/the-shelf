"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CommunityPost } from "@/lib/community/contracts";
import { fieldClass, type RunCommand } from "./forms";
export function PostCard({
  post,
  admin,
  busy,
  run,
  open,
}: {
  post: CommunityPost;
  admin: boolean;
  busy: boolean;
  run: RunCommand;
  open?: () => void;
}) {
  const [reporting, setReporting] = useState(false),
    [reason, setReason] = useState("");
  return (
    <article className="min-w-0 space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{post.alias}</span>
        <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString()}</time>
        {post.hidden && <span>Hidden by moderation</span>}
        {post.locked && <span>Replies closed</span>}
      </div>
      {post.title && (
        <h2 className="break-words font-serif text-xl">
          {open ? (
            <button className="text-left underline-offset-4 hover:underline" onClick={open}>
              {post.title}
            </button>
          ) : (
            post.title
          )}
        </h2>
      )}
      {post.removed ? (
        <p className="text-sm italic text-muted-foreground">This post was removed by its author.</p>
      ) : post.spoiler ? (
        <details className="rounded-lg bg-muted/50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Reveal spoiler</summary>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{post.body}</p>
        </details>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-7">{post.body}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {open && (
          <Button size="sm" variant="outline" onClick={open}>
            {post.replies} {post.replies === 1 ? "reply" : "replies"} · Open discussion
          </Button>
        )}
        {post.own && !post.removed && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  post.parentId
                    ? "Remove your reply?"
                    : "Remove this discussion? Its replies will no longer be accessible.",
                )
              )
                void run({ action: "remove", id: post.id });
            }}
          >
            Remove my post
          </Button>
        )}
        {!post.own && !post.removed && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setReporting(!reporting)}
          >
            Report
          </Button>
        )}
        {admin && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run({
                  action: "moderate",
                  id: post.id,
                  hidden: !post.hidden,
                  locked: post.locked,
                })
              }
            >
              {post.hidden ? "Restore visibility" : "Hide post"}
            </Button>
            {!post.parentId && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run({
                    action: "moderate",
                    id: post.id,
                    hidden: post.hidden,
                    locked: !post.locked,
                  })
                }
              >
                {post.locked ? "Reopen replies" : "Close replies"}
              </Button>
            )}
          </>
        )}
      </div>
      {reporting && (
        <form
          className="space-y-2 border-t pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run({ action: "report", id: post.id, reason })) {
              setReporting(false);
              setReason("");
            }
          }}
        >
          <label className="block text-sm">
            Reason for reporting
            <textarea
              className={`${fieldClass} mt-2`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={500}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Only moderators see your report and community name.
          </p>
          <Button size="sm" disabled={busy}>
            Send report
          </Button>
        </form>
      )}
    </article>
  );
}
