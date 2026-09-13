"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/components/library-provider";
import { storage } from "@/lib/storage";
import { ReaderLoading } from "./reader-loading";

// pdf.js and epub.js touch browser globals; keep both readers entirely client-side.
const PdfReader = dynamic(() => import("./pdf-reader").then((m) => m.PdfReader), {
  ssr: false,
  loading: () => <ReaderLoading />,
});
const EpubReader = dynamic(() => import("./epub-reader").then((m) => m.EpubReader), {
  ssr: false,
  loading: () => <ReaderLoading />,
});

export function ReaderRoute({ bookId }: { bookId: string }) {
  const { books, booksLoading, settings, settingsLoaded } = useLibrary();
  const book = books.find((b) => b.id === bookId);
  const [file, setFile] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!book) return;
    let active = true;
    storage
      .getFile(book.fileId)
      .then((blob: Blob | undefined) => {
        if (!active) return;
        if (!blob) setError("The file for this book is missing. Open the book's details and attach it again.");
        else setFile(blob);
      })
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Could not load the book file."));
    return () => {
      active = false;
    };
    // Load the file once per book; metadata updates should not re-fetch the blob.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

  if (booksLoading || !settingsLoaded) return <ReaderLoading />;

  if (!book || error) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
        <p className="font-serif text-[26px] font-medium tracking-tight">{!book ? "This book isn’t on your shelf." : "This book can’t be opened."}</p>
        {error && <p className="mt-2 max-w-md text-sm text-muted-foreground">{error}</p>}
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">
            <ArrowLeft aria-hidden data-icon="inline-start" /> Back to Shelf
          </Link>
        </Button>
      </main>
    );
  }

  if (!file) return <ReaderLoading title={book.title} />;

  return book.format === "epub" ? (
    <EpubReader book={book} file={file} settings={settings} />
  ) : (
    <PdfReader book={book} file={file} settings={settings} />
  );
}
