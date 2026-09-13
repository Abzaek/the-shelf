"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookGrid } from "@/components/shelf/book-grid";
import { ShelfSkeleton } from "@/components/shelf/shelf-skeleton";
import { useLibrary } from "@/components/library-provider";
import { storage } from "@/lib/storage";
import { CreateCollectionDialog } from "./create-collection-dialog";

export function CollectionDetailPage({ id }: { id: string }) {
  const { collections, collectionsLoading, books, booksLoading, openBook } = useLibrary();
  const router = useRouter();
  const collection = collections.find((c) => c.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const members = useMemo(
    () => (collection ? collection.bookIds.map((bid) => books.find((b) => b.id === bid)).filter((b) => !!b) : []),
    [collection, books],
  );

  if (collectionsLoading || booksLoading) return <ShelfSkeleton count={6} />;
  if (!collection) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-2xl">This collection no longer exists.</p>
        <Button asChild variant="ghost" className="mt-4">
          <Link href="/collections">Back to collections</Link>
        </Button>
      </div>
    );
  }

  const toggle = async (bookId: string, checked: boolean) => {
    const next = checked ? [...collection.bookIds, bookId] : collection.bookIds.filter((b) => b !== bookId);
    await storage.updateCollection(collection.id, { bookIds: next });
  };

  const remove = async () => {
    await storage.deleteCollection(collection.id);
    toast("Collection deleted", { description: "The books stay on your shelf." });
    router.push("/collections");
  };

  return (
    <div className="space-y-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/collections">
            <ArrowLeft aria-hidden data-icon="inline-start" /> Collections
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[28px] font-medium leading-none tracking-tight sm:text-[32px]">{collection.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {collection.description ? `${collection.description} · ` : ""}
              {members.length} {members.length === 1 ? "book" : "books"}
            </p>
          </div>
          <div className="flex gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Plus aria-hidden data-icon="inline-start" /> Add books
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 min-w-64 overflow-y-auto">
                <DropdownMenuLabel>Books on your shelf</DropdownMenuLabel>
                {books.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Your shelf is empty.</p>}
                {books.map((b) => (
                  <DropdownMenuCheckboxItem
                    key={b.id}
                    checked={collection.bookIds.includes(b.id)}
                    onCheckedChange={(checked) => toggle(b.id, !!checked)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="truncate">{b.title}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" aria-label="Edit collection" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete collection" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {members.length ? (
        <BookGrid books={members} onOpen={(b) => openBook(b.id)} />
      ) : (
        <p className="py-16 text-center font-serif text-lg italic text-muted-foreground">No books in this collection yet.</p>
      )}

      <CreateCollectionDialog open={editOpen} onOpenChange={setEditOpen} collection={collection} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium">Delete “{collection.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Only the collection is removed. The books stay on your shelf.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
