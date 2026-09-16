"use client";
import { useSyncExternalStore } from "react";
import { syncStatus } from "@/lib/sync/status";
import { useLibrary } from "@/components/library-provider";
export function SyncIndicator() {
  const state = useSyncExternalStore(syncStatus.subscribe, syncStatus.get, syncStatus.server);
  const { user } = useLibrary();
  if (!user) return null;
  const label = {
    starting: "Opening device library",
    syncing: "Syncing your shelf",
    offline: "Offline · saved on this device",
    saved: "Shelf synced",
    error: "Sync needs attention",
    "sign-in": "Sign in to resume sync",
  }[state.phase];
  return (
    <a
      href="/settings#offline"
      className="fixed bottom-3 left-3 z-40 max-w-[calc(100vw-1.5rem)] rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
      aria-live="polite"
      role="status"
    >
      {label}
      {state.pending ? ` · ${state.pending} pending` : ""}
    </a>
  );
}
