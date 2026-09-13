"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Library, Plus, Settings } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useLibrary } from "@/components/library-provider";
import { searchBooks } from "@/hooks/use-books";
import { BookCover } from "@/components/books/book-cover";
import { STATUS_LABELS } from "@/types";

/** Global ⌘K search across title, author, category and tags. */
export function SearchCommand() {
  const { books, collections, searchOpen, setSearchOpen, openBook, setAddBookOpen } = useLibrary();
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  const results = useMemo(() => searchBooks(books, query).slice(0, 12), [books, query]);
  const matchingCollections = useMemo(
    () => (query.trim() ? collections.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())) : []),
    [collections, query],
  );

  const close = () => setSearchOpen(false);

  return (
    <CommandDialog
      open={searchOpen}
      onOpenChange={(open) => {
        setSearchOpen(open);
        if (!open) setQuery("");
      }}
      title="Search your library"
      description="Find books by title, author, category or tag."
    >
      <Command shouldFilter={false} className="rounded-xl">
      <CommandInput placeholder="Search books, authors, categories, tags…" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No books match “{query}”.</CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading="Books">
            {results.map((book) => (
              <CommandItem
                key={book.id}
                value={book.id}
                onSelect={() => {
                  close();
                  openBook(book.id);
                }}
                className="gap-3 py-2"
              >
                <div className="w-7 shrink-0">
                  <BookCover book={book} className="rounded-[1px_3px_3px_1px] shadow-none" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-[14.5px]">{book.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {book.author} · {book.category} · {STATUS_LABELS[book.status]}
                  </p>
                </div>
                {book.status === "reading" && <span className="text-xs tabular-nums text-brass">{book.progress}%</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {matchingCollections.length > 0 && (
          <CommandGroup heading="Collections">
            {matchingCollections.map((c) => (
              <CommandItem
                key={c.id}
                value={`collection-${c.id}`}
                onSelect={() => {
                  close();
                  router.push(`/collections/${c.id}`);
                }}
              >
                <Library aria-hidden />
                {c.name}
                <span className="ml-auto text-xs text-muted-foreground">{c.bookIds.length}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="action-add"
            onSelect={() => {
              close();
              setAddBookOpen(true);
            }}
          >
            <Plus aria-hidden /> Add a book
          </CommandItem>
          <CommandItem
            value="action-reading"
            onSelect={() => {
              close();
              router.push("/reading");
            }}
          >
            <BookOpen aria-hidden /> Currently reading
          </CommandItem>
          <CommandItem
            value="action-settings"
            onSelect={() => {
              close();
              router.push("/settings");
            }}
          >
            <Settings aria-hidden /> Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
