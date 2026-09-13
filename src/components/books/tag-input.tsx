"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagInput({ id, value, onChange, placeholder = "Add a tag and press Enter" }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const parts = draft.split(",").map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = Array.from(new Set([...value, ...parts]));
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={placeholder}
        aria-describedby={id ? `${id}-help` : undefined}
      />
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {value.map((tag) => (
            <li
              key={tag}
              className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground")}
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {id && (
        <p id={`${id}-help`} className="sr-only">
          Press Enter or comma to add a tag. Backspace removes the last tag.
        </p>
      )}
    </div>
  );
}
