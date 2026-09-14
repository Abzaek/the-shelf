"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLibrary } from "@/components/library-provider";
import { AccountMenu } from "./account-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "All Books" },
  { href: "/reading", label: "Reading" },
  { href: "/want-to-read", label: "Want to Read" },
  { href: "/finished", label: "Finished" },
  { href: "/collections", label: "Collections" },
];

export function ShelfHeader() {
  const pathname = usePathname();
  const { user, setAddBookOpen, setSearchOpen } = useLibrary();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="The Shelf — home"
        >
          <BookOpen className="size-[18px] text-brass" strokeWidth={1.75} aria-hidden />
          <span className="font-serif text-[19px] font-medium tracking-tight">The Shelf</span>
        </Link>

        <nav aria-label="Library" className="hidden md:flex items-center gap-1 ml-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-[13.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(item.href)
                  ? "bg-foreground/[0.06] text-foreground font-medium dark:bg-foreground/[0.08]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {user?.role === "admin" && <Button asChild variant="ghost" size="sm"><Link href="/admin">Analytics</Link></Button>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Search library" onClick={() => setSearchOpen(true)}>
                <Search aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Search <kbd className="ml-1 font-mono text-[10px] opacity-70">⌘K</kbd>
            </TooltipContent>
          </Tooltip>
          <Button onClick={() => setAddBookOpen(true)} className="gap-1.5" aria-label="Add a book">
            <Plus aria-hidden />
            <span className="hidden sm:inline">Add Book</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/settings" aria-label="Settings" aria-current={pathname === "/settings" ? "page" : undefined}>
                  <Settings aria-hidden />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <AccountMenu />
        </div>
      </div>

      {/* Mobile nav */}
      <nav aria-label="Library" className="md:hidden overflow-x-auto scroll-hide">
        <div className="mx-auto flex max-w-[1600px] gap-1 px-4 pb-2.5 sm:px-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(item.href)
                  ? "border-foreground/20 bg-foreground/[0.06] text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
