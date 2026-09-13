"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/components/library-provider";
import { storage } from "@/lib/storage";
import { ReaderLoading } from "./reader-loading";

// pdf.js touches browser globals; keep the reader entirely client-side.
const PdfReader = dynamic(() => import("./pdf-reader").then((m) => m.PdfReader), {
  ssr: false,
  loading: () => <ReaderLoading />,
});

export function ReaderRoute({ bookId }: { bookId: string }) {
  const { books, booksLoading, settings, settingsLoaded } = useLibrary();
  const book = books.find((b) => b.id === bookId);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!book) return;
    let active = true;
    storage
      .getPdf(book.pdfId)
      .then((blob) => {
        if (!active) return;
        if (!blob) setError("The PDF file for this book is missing. Open the book's details and attach it again.");
        else setPdf(blob);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load the PDF."));
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

  if (!pdf) return <ReaderLoading title={book.title} />;

  return <PdfReader book={book} file={pdf} settings={settings} />;
}
