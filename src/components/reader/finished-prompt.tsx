"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FinishedPromptProps {
  onFinish: () => void;
  onDismiss: () => void;
}

export function FinishedPrompt({ onFinish, onDismiss }: FinishedPromptProps) {
  return (
    <div
      role="dialog"
      aria-labelledby="finished-prompt-title"
      className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-popover/95 px-4 py-3 shadow-xl backdrop-blur animate-shelf-in"
    >
      <div className="min-w-0">
        <p id="finished-prompt-title" className="font-serif text-[16px] font-medium">Finished this book?</p>
        <p className="text-xs text-muted-foreground">You’ve reached the last page.</p>
      </div>
      <Button size="sm" onClick={onFinish} className="ml-2 shrink-0">
        <Check aria-hidden data-icon="inline-start" /> Mark as Finished
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
        <X aria-hidden />
      </Button>
    </div>
  );
}
