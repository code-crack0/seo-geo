// src/components/audit/actions-list.tsx
"use client";
import { StrategyResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const categoryColors = { technical: "info", content: "accent", schema: "good", geo: "warning" } as const;
const impactColors = { high: "critical", medium: "warning", low: "default" } as const;

// The LLM sometimes outputs non-standard field names — handle both old and new schemas
type RawAction = StrategyResult["prioritizedActions"][0] & {
  title?: string;
  what?: string;
  why?: string;
  expectedImpact?: string;
  affectedPages?: string[];
};

function normalizeAction(a: RawAction) {
  const actionText = a.action || a.title || "";
  const details = a.details || [a.what, a.why].filter(Boolean).join("\n\n") || "";
  const impact = (a.impact?.toLowerCase() ?? "high") as "high" | "medium" | "low";
  const effort = (a.effort?.toLowerCase() ?? "low") as "high" | "medium" | "low";
  const category = a.category ?? "technical";
  return { ...a, action: actionText, details, impact, effort, category };
}

export function ActionsList({ actions }: { actions: StrategyResult["prioritizedActions"] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const raw = actions as RawAction[];
  const normalized = raw.map(normalizeAction);
  const quickWins = normalized.filter(a => a.impact === "high" && a.effort === "low");
  const strategic = normalized.filter(a => !(a.impact === "high" && a.effort === "low"));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">📋 Prioritized Actions</h3>
        <Badge>{actions.length} actions identified</Badge>
      </div>
      {quickWins.length > 0 && (
        <div className="space-y-2">
          {quickWins.map((action) => (
            <ActionCard key={action.rank} action={action} expanded={expanded === action.rank} onToggle={() => setExpanded(expanded === action.rank ? null : action.rank)} />
          ))}
        </div>
      )}
      {strategic.length > 0 && (
        <>
          <div className="flex items-center gap-4 my-4">
            <div className="flex-1 border-t border-[var(--border)]" />
            <span className="text-xs text-[var(--text-tertiary)]">⚡ Quick Wins Above • Strategic Projects Below</span>
            <div className="flex-1 border-t border-[var(--border)]" />
          </div>
          <div className="space-y-2">
            {strategic.map((action) => (
              <ActionCard key={action.rank} action={action} expanded={expanded === action.rank} onToggle={() => setExpanded(expanded === action.rank ? null : action.rank)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActionCard({ action, expanded, onToggle }: { action: ReturnType<typeof normalizeAction>; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden">
      <button onClick={onToggle} aria-expanded={expanded} className="w-full px-4 py-3 text-left">
        <div className="flex items-start gap-3">
          <span className="text-lg font-bold font-mono text-[var(--text-tertiary)] leading-tight shrink-0 w-6 text-right">{action.rank}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">
              {action.action || <span className="text-[var(--text-tertiary)] italic">No action text</span>}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <Badge variant={categoryColors[action.category] ?? "default"}>{action.category}</Badge>
              <Badge variant={impactColors[action.impact] ?? "default"}>Impact: {action.impact}</Badge>
              <Badge>Effort: {action.effort}</Badge>
            </div>
          </div>
          <span className="text-[var(--text-tertiary)] text-xs shrink-0 mt-0.5">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && action.details && (
        <div className="px-4 pb-4 text-xs text-[var(--text-secondary)] border-t border-[var(--border)] pt-3 whitespace-pre-line">
          {action.details}
        </div>
      )}
    </div>
  );
}
