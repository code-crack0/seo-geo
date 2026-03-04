// src/components/ui/progress.tsx
import { cn } from "@/lib/utils";

interface ProgressProps { value: number; color?: string; className?: string; }
export function Progress({ value, color = "var(--accent)", className }: ProgressProps) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-[var(--bg-tertiary)]", className)}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}
