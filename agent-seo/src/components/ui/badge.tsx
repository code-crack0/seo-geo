// src/components/ui/badge.tsx
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
      critical: "bg-red-950 text-red-400",
      warning: "bg-amber-950 text-amber-400",
      good: "bg-green-950 text-green-400",
      info: "bg-blue-950 text-blue-400",
      accent: "bg-[var(--accent-bg)] text-[var(--accent)]",
    },
  },
  defaultVariants: { variant: "default" },
});

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
