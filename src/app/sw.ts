/// <reference lib="webworker" />
import { Serwist, NetworkOnly, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new worker waits until old windows close, avoiding mixed application/schema versions.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" &&
        url.origin === self.location.origin &&
        !url.pathname.startsWith("/admin") &&
        !url.pathname.startsWith("/api"),
      // A stalled connection must also reach the public offline fallback.
      handler: new NetworkOnly({ networkTimeoutSeconds: 3 }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) =>
          request.mode === "navigate" &&
          !new URL(request.url).pathname.startsWith("/admin") &&
          !new URL(request.url).pathname.startsWith("/api"),
      },
    ],
  },
});
// Auth, API responses, book bytes, and admin pages never enter the shared HTTP cache.
serwist.addEventListeners();
