"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/books/book-cover";
import { useLibrary } from "@/components/library-provider";
import { CreateCollectionDialog } from "./create-collection-dialog";

export function CollectionsPage() {
  const { collections, collectionsLoading, books } = useLibrary();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] font-medium leading-none tracking-tight sm:text-[32px]">Collections</h1>
          <p className="mt-2 text-sm text-muted-foreground">Shelves within the shelf. Optional, and entirely yours.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden data-icon="inline-start" /> New Collection
        </Button>
      </div>

      {collectionsLoading ? null : collections.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-serif text-2xl">No collections yet.</p>
          <p className="mt-2 font-serif italic text-muted-foreground">“Gather a few books around an idea.”</p>
          <Button className="mt-6" variant="outline" onClick={() => setCreateOpen(true)}>
            Create a collection
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => {
            const members = c.bookIds.map((id) => books.find((b) => b.id === id)).filter(Boolean).slice(0, 4);
            return (
              <li key={c.id}>
                <Link
                  href={`/collections/${c.id}`}
                  className="group/card flex h-full gap-4 rounded-xl border border-border/70 bg-card/60 p-4 transition-colors hover:bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative h-[92px] w-[92px] shrink-0">
                    {members.length ? (
                      members.map((b, i) => (
                        <div
                          key={b!.id}
                          className="absolute bottom-0 w-[58px]"
                          style={{ left: i * 11, zIndex: members.length - i, transform: `rotate(${(i - 1.5) * 1.5}deg)` }}
                        >
                          <BookCover book={b!} className="shadow-md" />
                        </div>
                      ))
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                        Empty
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-[18px] font-medium leading-snug tracking-tight">{c.name}</h2>
                    {c.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{c.description}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {c.bookIds.length} {c.bookIds.length === 1 ? "book" : "books"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
