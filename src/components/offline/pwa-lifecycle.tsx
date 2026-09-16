"use client";
import { useEffect } from "react";
export function PwaLifecycle() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker
        .register("/serwist/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => console.error("Offline application setup failed", error));
    }
    const navigate = (event: MouseEvent) => {
      if (
        navigator.onLine ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const anchor = (event.target as Element)?.closest?.("a");
      if (!anchor || anchor.download || anchor.target === "_blank") return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.hash || url.pathname.startsWith("/api/")) return;
      event.preventDefault();
      event.stopPropagation();
      location.assign(url.href);
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, []);
  return null;
}
