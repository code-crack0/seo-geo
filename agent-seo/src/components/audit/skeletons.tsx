// src/components/audit/skeletons.tsx
"use client";
import { Skeleton } from "@/components/ui/skeleton";

export function ScoreCardSkeleton() {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-36 w-36 rounded-full mx-auto" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function ResultCardSkeleton() {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-6 w-10 rounded" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function BrowserSkeleton() {
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[var(--bg-secondary)]" />
          <div className="w-3 h-3 rounded-full bg-[var(--bg-secondary)]" />
          <div className="w-3 h-3 rounded-full bg-[var(--bg-secondary)]" />
        </div>
        <Skeleton className="flex-1 h-6 rounded-md" />
      </div>
      <div className="aspect-video bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-sm text-[var(--text-tertiary)]">Waiting for browser session...</p>
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
