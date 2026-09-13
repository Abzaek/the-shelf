import { Skeleton } from "@/components/ui/skeleton";

export function ReaderLoading({ title }: { title?: string }) {
  return (
    <div className="flex min-h-svh flex-col bg-background" aria-busy aria-live="polite">
      <div className="flex h-12 items-center gap-3 border-b border-border/70 px-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-48" />
        <span className="sr-only">{title ? `Opening ${title}` : "Opening book"}</span>
        <div className="ml-auto flex gap-2">
          <Skeleton className="size-7" />
          <Skeleton className="size-7" />
          <Skeleton className="size-7" />
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-hidden p-6">
        <Skeleton className="aspect-[3/4] w-full max-w-[720px]" />
      </div>
    </div>
  );
}
