export interface SyncStatus {
  phase: "starting" | "syncing" | "offline" | "saved" | "error" | "sign-in";
  pending: number;
  error: string | null;
  lastSyncedAt: string | null;
  initialPullComplete: boolean;
}
const initial: SyncStatus = {
  phase: "starting",
  pending: 0,
  error: null,
  lastSyncedAt: null,
  initialPullComplete: false,
};
let current = initial;
const listeners = new Set<() => void>();
export const syncStatus = {
  get: () => current,
  server: () => initial,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set: (patch: Partial<SyncStatus>) => {
    current = { ...current, ...patch };
    listeners.forEach((listener) => listener());
  },
  reset: () => {
    current = { ...initial };
    listeners.forEach((listener) => listener());
  },
};
