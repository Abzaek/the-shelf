"use client";

import { useLibrary } from "@/components/library-provider";

export function useSettings() {
  const { settings, updateSettings } = useLibrary();
  return { settings, updateSettings };
}
