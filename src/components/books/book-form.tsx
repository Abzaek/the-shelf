"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/hooks/use-settings";
import { DEFAULT_CATEGORIES, READING_STATUSES, STATUS_LABELS, type ReadingStatus } from "@/types";
import { TagInput } from "./tag-input";

export interface BookFormValues {
  title: string;
  author: string;
  category: string;
  description: string;
  tags: string[];
  status: ReadingStatus;
}

interface BookFormProps {
  values: BookFormValues;
  onChange: (patch: Partial<BookFormValues>) => void;
  idPrefix?: string;
  autoFocusTitle?: boolean;
}

const CUSTOM = "__custom__";

export function BookFormFields({ values, onChange, idPrefix = "book", autoFocusTitle }: BookFormProps) {
  const { settings } = useSettings();
  const categories = useMemo(() => {
    const all = [...DEFAULT_CATEGORIES.filter((c) => c !== "Other"), ...settings.customCategories];
    if (values.category && !all.includes(values.category) && values.category !== "Other") all.push(values.category);
    return [...Array.from(new Set(all)).sort((a, b) => a.localeCompare(b)), "Other"];
  }, [settings.customCategories, values.category]);

  const [customMode, setCustomMode] = useState(false);
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={id("title")}>Title</Label>
        <Input
          id={id("title")}
          value={values.title}
          onChange={(e) => onChange({ title: e.target.value })}
          required
          autoFocus={autoFocusTitle}
          className="font-serif text-[15px]"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("author")}>Author</Label>
        <Input id={id("author")} value={values.author} onChange={(e) => onChange({ author: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("category")}>Category</Label>
          {customMode ? (
            <Input
              id={id("category")}
              autoFocus
              placeholder="New category"
              value={values.category}
              onChange={(e) => onChange({ category: e.target.value })}
              onBlur={() => {
                if (!values.category.trim()) {
                  onChange({ category: "Other" });
                  setCustomMode(false);
                }
              }}
            />
          ) : (
            <Select
              value={values.category || "Other"}
              onValueChange={(v) => {
                if (v === CUSTOM) {
                  onChange({ category: "" });
                  setCustomMode(true);
                } else onChange({ category: v });
              }}
            >
              <SelectTrigger id={id("category")} className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Custom category…</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("status")}>Status</Label>
          <Select value={values.status} onValueChange={(v) => onChange({ status: v as ReadingStatus })}>
            <SelectTrigger id={id("status")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {READING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("description")}>Description</Label>
        <Textarea
          id={id("description")}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="A line or two about why this book is on your shelf."
          className="resize-none"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("tags")}>Tags</Label>
        <TagInput id={id("tags")} value={values.tags} onChange={(tags) => onChange({ tags })} />
      </div>
    </div>
  );
}
