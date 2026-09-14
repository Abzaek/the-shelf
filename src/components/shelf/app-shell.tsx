"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { ShelfHeader } from "./shelf-header";
import { SearchCommand } from "./search-command";
import { BookDetailsDialog } from "@/components/books/book-details-dialog";
import { EditBookDialog } from "@/components/books/edit-book-dialog";

// The Add Book flow pulls in pdf.js; load it only on the client, when needed.
const AddBookDialog = dynamic(() => import("@/components/books/add-book-dialog").then((m) => m.AddBookDialog), {
  ssr: false,
});

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "library_opened" }) }).catch(() => {});
  }, []);
  return (
    <div className="flex min-h-svh flex-col">
      <ShelfHeader />
      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        {children}
      </main>
      <SearchCommand />
      <AddBookDialog />
      <BookDetailsDialog />
      <EditBookDialog />
    </div>
  );
}
