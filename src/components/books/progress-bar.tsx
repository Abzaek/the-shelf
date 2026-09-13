import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
  label?: string;
  size?: "xs" | "sm";
}

export function ProgressBar({ value, className, label, size = "xs" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${pct}% read`}
      className={cn("w-full overflow-hidden rounded-full bg-foreground/10", size === "xs" ? "h-1" : "h-1.5", className)}
    >
      <div className="h-full rounded-full bg-brass transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}
