import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ReadingStatus } from "@/types";

const STYLES: Record<ReadingStatus, string> = {
  reading: "bg-brass/15 text-brass dark:bg-brass/20",
  "want-to-read": "bg-muted text-muted-foreground",
  finished: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  paused: "bg-amber-600/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
};

export function StatusBadge({ status, className }: { status: ReadingStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium tracking-wide whitespace-nowrap",
        STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
