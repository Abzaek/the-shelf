"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addSampleBooks } from "@/lib/seed";

export function EmptyShelf({ onAdd }: { onAdd: () => void }) {
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      const added = await addSampleBooks();
      toast.success(added ? `Added ${added} sample books` : "Sample books are already on your shelf");
    } catch (err) {
      toast.error("Could not add sample books", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <section className="flex flex-col items-center px-4 py-20 text-center sm:py-28" aria-labelledby="empty-heading">
      {/* Three quiet book spines, not an illustration */}
      <div className="mb-10 flex items-end gap-2" aria-hidden>
        <span className="h-24 w-6 rounded-[2px] bg-foreground/[0.08] dark:bg-foreground/[0.12]" />
        <span className="h-28 w-5 rounded-[2px] bg-brass/40" />
        <span className="h-[88px] w-7 rounded-[2px] bg-foreground/[0.12] dark:bg-foreground/[0.16]" />
        <span className="h-[104px] w-5 rounded-[2px] bg-foreground/[0.06] dark:bg-foreground/[0.1]" />
      </div>
      <h2 id="empty-heading" className="font-serif text-[30px] font-medium tracking-tight sm:text-[36px]">
        Your shelf is empty.
      </h2>
      <p className="mt-3 max-w-sm font-serif text-[17px] italic text-muted-foreground">
        “Add the first book to your personal library.”
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button size="lg" onClick={onAdd} className="px-5">
          <Plus aria-hidden data-icon="inline-start" />
          Add a Book
        </Button>
        <Button size="lg" variant="ghost" onClick={seed} disabled={seeding} className="text-muted-foreground">
          {seeding ? "Adding samples…" : "or try with sample books"}
        </Button>
      </div>
    </section>
  );
}
