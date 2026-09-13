"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LibraryProvider } from "./library-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        <LibraryProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "!bg-popover !text-popover-foreground !border-border !shadow-lg !rounded-xl",
                description: "!text-muted-foreground",
              },
            }}
          />
        </LibraryProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
