"use client";

import { useRef } from "react";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookCover } from "./book-cover";
import { useBlobUrl } from "@/hooks/use-cover-url";
import { normalizeCoverImage } from "@/lib/pdf/thumbnail";
import { toast } from "sonner";

interface CoverPickerProps {
  title: string;
  author: string;
  /** Currently chosen cover blob (custom or generated). null = none. */
  cover: Blob | null;
  onChange: (cover: Blob | null, kind: "custom" | "generated" | "none") => void;
  /** Provided when a generated first-page cover exists to restore. */
  generated?: Blob | null;
  /** Existing stored cover id when editing (used when no blob has been chosen yet). */
  storedCoverId?: string | null;
  bookId?: string;
}

export function CoverPicker({ title, author, cover, onChange, generated, storedCoverId, bookId }: CoverPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useBlobUrl(cover);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file for the cover.");
      return;
    }
    try {
      onChange(await normalizeCoverImage(file), "custom");
    } catch (err) {
      toast.error("Could not use that image", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-[150px] sm:w-[170px]">
        <BookCover
          book={{ id: bookId ?? "new", title: title || "Untitled", author, coverId: cover ? null : storedCoverId ?? null }}
          previewUrl={previewUrl}
          className="shadow-xl"
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
        aria-label="Upload a custom cover image"
      />
      <div className="flex flex-wrap justify-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          <ImagePlus aria-hidden data-icon="inline-start" /> Custom cover
        </Button>
        {generated && cover !== generated && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(generated, "generated")}>
            <RotateCcw aria-hidden data-icon="inline-start" /> First page
          </Button>
        )}
        {(cover || storedCoverId) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null, "none")} className="text-muted-foreground">
            <Trash2 aria-hidden data-icon="inline-start" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
