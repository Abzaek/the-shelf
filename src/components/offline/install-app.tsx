"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    queueMicrotask(() =>
      setInstalled(
        matchMedia("(display-mode: standalone)").matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      ),
    );
    const install = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", done);
    let live = true;
    const controlled = () => {
      if (live && navigator.serviceWorker.controller) setReady(true);
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", controlled);
      void navigator.serviceWorker.ready.then(controlled);
    }
    return () => {
      live = false;
      navigator.serviceWorker?.removeEventListener("controllerchange", controlled);
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return (
    <div className="space-y-2">
      <h3 className="font-medium">{installed ? "The Shelf is installed" : "Install The Shelf"}</h3>
      <p className="text-sm text-muted-foreground">
        Open your library from your home screen or desktop.
      </p>
      {prompt && !installed && (
        <Button
          variant="outline"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          Install The Shelf
        </Button>
      )}
      {!prompt && !installed && (
        <p className="text-sm text-muted-foreground">
          On iPhone or iPad, use Share → Add to Home Screen. On Mac Safari, use File → Add to Dock.
          In Chrome or Edge, use the install option in the address bar or browser menu.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {ready
          ? "Offline app is ready. Download the books you want to read without a connection."
          : "Preparing the offline app requires a connection and a production build. Keep this window open until setup finishes."}
      </p>
    </div>
  );
}
