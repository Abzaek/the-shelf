import { deleteLocalAccount, openLocalDatabase, type LocalDatabase } from "./database";
import { startSync, type SyncController } from "@/lib/sync/client";
import { syncStatus } from "@/lib/sync/status";
let active: Promise<LocalDatabase> | null = null;
let userId: string | null = null;
let controller: SyncController | null = null;
let generation = 0;
export function currentUserId() {
  return userId;
}
export function localDatabase(): Promise<LocalDatabase> {
  if (!active) throw new Error("Sign in once while online to prepare this device's library.");
  return active;
}
export async function activateLibrary(id: string): Promise<void> {
  if (id === userId && active) {
    await active;
    controller?.retry();
    return;
  }
  const token = ++generation;
  const old = controller;
  controller = null;
  userId = id;
  active = openLocalDatabase(id);
  syncStatus.reset();
  await old?.stop();
  const database = await active;
  if (token !== generation) return;
  controller = startSync(database, () => userId === id && token === generation);
}
export async function deactivateLibrary(): Promise<void> {
  ++generation;
  userId = null;
  active = null;
  const old = controller;
  controller = null;
  await old?.stop();
  syncStatus.reset();
}
export function retrySync() {
  controller?.retry();
}
export function deviceId(): string {
  const key = "shelf-device-v1";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export async function eraseDeletedAccount(id: string) {
  if (userId === id) await deactivateLibrary();
  await deleteLocalAccount(id);
}
