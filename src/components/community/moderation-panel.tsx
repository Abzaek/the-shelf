"use client";
import { useState } from "react";
import type { CommunityAdmin } from "@/lib/community/contracts";
import { Button } from "@/components/ui/button";
import { fieldClass, RoomForm, type RunCommand } from "./forms";
export function ModerationPanel({
  data,
  paused,
  busy,
  run,
}: {
  data: CommunityAdmin;
  paused: boolean;
  busy: boolean;
  run: RunCommand;
}) {
  const [email, setEmail] = useState("");
  const stats = [
    ["Joined readers", data.metrics.members],
    ["Contributors · 7 days", data.metrics.contributors],
    ["New discussions · 7 days", data.metrics.threads],
    ["Received a reply", data.metrics.repliedThreads],
    ["Visited on 2+ days · 7 days", data.metrics.returningReaders],
  ];
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">Pilot desk</h2>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run({ action: "pause", paused: !paused })}
        >
          {paused ? "Resume pilot" : "Pause pilot"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="font-serif text-3xl">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        “Received a reply” counts new discussions from the last 7 days with a visible reply from
        another reader. Visits measure community pages only. No personal reading activity is shared.
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <RoomForm run={run} busy={busy} />
        <div className="space-y-4 rounded-xl border p-5">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run({ action: "invite", email })) setEmail("");
            }}
          >
            <h3 className="font-serif text-xl">Invite a Shelf reader</h3>
            <p className="text-xs text-muted-foreground">
              Use an existing account. This enables the Join button for that reader; no email is
              sent. The pilot is capped at 200 invited accounts.
            </p>
            <label className="block text-sm">
              Account email
              <input
                type="email"
                className={`${fieldClass} mt-1`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </label>
            <Button disabled={busy}>Enable invitation</Button>
          </form>
          <div className="max-h-96 space-y-3 overflow-y-auto border-t pt-4">
            {data.members.length === 0 && (
              <p className="text-sm text-muted-foreground">No invited readers yet.</p>
            )}
            {data.members.map((member) => (
              <div
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm">{member.alias || member.email}</p>
                  <p className="text-xs text-muted-foreground">{member.status}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: "member",
                      userId: member.userId,
                      suspended: member.status !== "suspended",
                    })
                  }
                >
                  {member.status === "suspended" ? "Restore access" : "Suspend"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="font-serif text-xl">Reports to review</h3>
        {!data.reports.length && (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No open reports.
          </p>
        )}
        {data.reports.map((report) => (
          <article key={report.id} className="space-y-3 rounded-xl border p-5">
            <p className="text-sm font-medium">Report from {report.alias || "Former reader"}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{report.reason}</p>
            <blockquote className="border-l-2 pl-4 text-sm text-muted-foreground">
              <strong className="block">{report.title}</strong>
              <p className="whitespace-pre-wrap break-words">
                {report.removed ? "Post removed by author" : report.body}
              </p>
            </blockquote>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run({
                    action: "moderate",
                    id: report.postId,
                    hidden: !report.hidden,
                    locked: !!report.locked,
                  })
                }
              >
                {report.hidden ? "Restore post" : "Hide reported post"}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void run({ action: "resolve", reportId: report.id })}
              >
                Mark reviewed
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
