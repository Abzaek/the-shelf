import type { LibraryStats } from "@/types";

export function LibraryStatsRow({ stats, title = "My Library", subtitle }: { stats: LibraryStats; title?: string; subtitle?: string }) {
  const items = [
    { label: "Books", value: stats.total },
    { label: "Reading", value: stats.reading },
    { label: "Finished", value: stats.finished },
    { label: "Want to read", value: stats.wantToRead },
  ];
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div>
        <h1 className="font-serif text-[28px] font-medium leading-none tracking-tight sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground" aria-label="Library statistics">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-1.5">
            <dd className="font-serif text-[17px] font-medium tabular-nums text-foreground">{item.value}</dd>
            <dt>{item.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
