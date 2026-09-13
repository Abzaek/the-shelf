"use client";

import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProgressBar } from "@/components/books/progress-bar";
import { useLibrary } from "@/components/library-provider";
import { formatBytes } from "@/lib/utils/format";

export function AccountMenu() {
  const { user, usage, signOut } = useLibrary();
  if (!user) return null;
  const initial = (user.displayName || user.email).trim().charAt(0).toUpperCase();
  const pct = usage ? Math.min(100, Math.round((usage.usedBytes / Math.max(1, usage.quotaBytes)) * 100)) : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Account: ${user.email}`} className="rounded-full">
          <span className="flex size-6 items-center justify-center rounded-full bg-brass/20 font-serif text-[13px] font-medium text-brass">
            {initial || <UserRound className="size-3.5" aria-hidden />}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-medium text-foreground">{user.displayName || "Your shelf"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        {usage && (
          <div className="px-2 pb-2 pt-1">
            <div className="mb-1.5 flex justify-between text-[11.5px] text-muted-foreground">
              <span>Storage</span>
              <span className="tabular-nums">
                {formatBytes(usage.usedBytes)} / {formatBytes(usage.quotaBytes)}
              </span>
            </div>
            <ProgressBar value={pct} label={`${pct}% of storage used`} />
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
