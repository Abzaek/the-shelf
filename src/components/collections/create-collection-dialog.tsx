"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { storage } from "@/lib/storage";
import type { Collection } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (collection: Collection) => void;
  /** When provided, the dialog edits this collection instead. */
  collection?: Collection | null;
}

export function CreateCollectionDialog({ open, onOpenChange, onCreated, collection }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-[22px] font-medium tracking-tight">
            {collection ? "Edit collection" : "New collection"}
          </DialogTitle>
          <DialogDescription>Group books however you like. A book can live in many collections.</DialogDescription>
        </DialogHeader>
        {/* Keyed so the form state resets every time the dialog opens. */}
        {open && <CollectionForm key={collection?.id ?? "new"} collection={collection} onOpenChange={onOpenChange} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function CollectionForm({ collection, onOpenChange, onCreated }: Omit<Props, "open">) {
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (collection) {
        await storage.updateCollection(collection.id, { name: name.trim(), description: description.trim() });
        toast.success("Collection updated");
      } else {
        const created = await storage.createCollection(name, description);
        toast.success(`Created “${created.name}”`);
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save collection", { description: err instanceof Error ? err.message : undefined });
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="collection-name">Name</Label>
        <Input id="collection-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Books I Need to Read" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="collection-description">Description</Label>
        <Textarea id="collection-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="resize-none" />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !name.trim()}>
          {collection ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}
