// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scoreToColor(score: number): string {
  if (score >= 90) return "var(--score-excellent)";
  if (score >= 70) return "var(--score-good)";
  if (score >= 50) return "var(--score-warning)";
  if (score >= 30) return "var(--score-poor)";
  return "var(--score-critical)";
}

export function scoreToLabel(score: number): string {
  if (score >= 90) return "EXCELLENT";
  if (score >= 70) return "GOOD";
  if (score >= 50) return "NEEDS WORK";
  if (score >= 30) return "POOR";
  return "CRITICAL";
}

export function formatDomain(url: string): string {
  try {
    const normalized = url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;
    return new URL(normalized).hostname;
  } catch {
    return url;
  }
}

export function ensureHttps(url: string): string {
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  if (!url.startsWith("https://")) return `https://${url}`;
  return url;
}
