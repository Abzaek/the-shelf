"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/components/library-provider";
import { pickDriveBook } from "@/lib/drive/picker";
import { retrySync } from "@/lib/storage/local/runtime";
export function DriveLibrary() {
  const { user } = useLibrary();
  const [state, setState] = useState<{ configured: boolean; connected: boolean } | null>(null),
    [busy, setBusy] = useState(false);
  const request = useCallback(
    async (path = "", method = "GET", body?: unknown) => {
      const response = await fetch(`/api/drive${path}`, {
        method,
        headers: { "X-Shelf-User": user?.id ?? "", "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Drive request failed.");
      return data;
    },
    [user?.id],
  );
  useEffect(() => {
    if (user)
      void request()
        .then(setState)
        .catch(() => {});
  }, [request, user]);
  const perform = async (action: "connect" | "pick" | "disconnect") => {
    setBusy(true);
    try {
      if (action === "connect") {
        location.assign((await request("/connect", "POST")).url);
        return;
      }
      if (action === "disconnect") {
        await request("", "DELETE");
        setState(await request());
      } else {
        const fileId = await pickDriveBook(await request("", "POST"));
        if (fileId) {
          await request("/import", "POST", { fileId });
          retrySync();
          toast.success("Drive book added. Download it to read offline.");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Drive is unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Your Google Drive library</h3>
      <p className="text-sm text-muted-foreground">
        Choose your own PDF and EPUB files from Drive. They stay in your Drive and do not use your
        Shelf file allowance. Only files you select are accessible. Your library and notes stay
        private.
      </p>
      {!state ? (
        <p className="text-sm text-muted-foreground">Connect to the internet to manage Drive.</p>
      ) : !state.configured ? (
        <p className="text-sm text-muted-foreground">
          Drive connections are not enabled on this Shelf yet.
        </p>
      ) : state.connected ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void perform("pick")}>
            Choose a Drive book
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void perform("connect")}>
            Reconnect
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void perform("disconnect")}>
            Disconnect Drive
          </Button>
        </div>
      ) : (
        <Button variant="outline" disabled={busy} onClick={() => void perform("connect")}>
          Connect Google Drive
        </Button>
      )}
      {state?.connected && (
        <p className="text-xs text-muted-foreground">
          Disconnecting stops future Drive downloads. Existing downloads remain on this device until
          you remove them. Re-select a file to refresh it after changes in Drive.
        </p>
      )}
    </div>
  );
}
