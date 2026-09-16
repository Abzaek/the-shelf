"use client";
import { useEffect, useState } from "react";
import { useLibrary } from "@/components/library-provider";
import { ReaderRoute } from "@/components/reader/reader-route";
import { AppShell } from "@/components/shelf/app-shell";
import { ShelfPage } from "@/components/shelf/shelf-page";
import { SettingsPage } from "@/components/settings/settings-page";
import { CollectionsPage } from "@/components/collections/collections-page";
import { CollectionDetailPage } from "@/components/collections/collection-detail-page";
import { ReaderLoading } from "@/components/reader/reader-loading";
/** Public, data-free HTML shell; private data is opened only by the account-scoped provider. */
export function OfflineApp() {
  const { user, authLoading } = useLibrary();
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => setPath(window.location.pathname));
  }, []);
  if (authLoading || !path) return <ReaderLoading />;
  if (!user)
    return (
      <main className="m-auto max-w-md p-8 text-center">
        <h1 className="font-serif text-3xl">Your shelf is offline</h1>
        <p className="my-4">
          Sign in while connected to prepare a library on this device. If you signed out, reconnect
          before signing in again.
        </p>
        <a href="/login" className="underline">
          Sign in
        </a>
      </main>
    );
  const reader = /^\/read\/([\w-]+)$/.exec(path);
  if (reader) return <ReaderRoute bookId={reader[1]} />;
  const collection = /^\/collections\/([\w-]+)$/.exec(path);
  const content =
    path === "/settings" ? (
      <SettingsPage />
    ) : path === "/collections" ? (
      <CollectionsPage />
    ) : collection ? (
      <CollectionDetailPage id={collection[1]} />
    ) : (
      <ShelfPage
        filter={
          path === "/reading"
            ? "reading"
            : path === "/finished"
              ? "finished"
              : path === "/want-to-read"
                ? "want-to-read"
                : "all"
        }
        title="Your Shelf"
        showFeatured={path === "/" || path === "/offline"}
      />
    );
  return <AppShell>{content}</AppShell>;
}
