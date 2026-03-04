// src/components/audit/technical-card.tsx
"use client";
import { TechnicalResult, TechnicalIssue } from "@/lib/types";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scoreToColor } from "@/lib/utils";
import { useState } from "react";

interface Props { result: TechnicalResult }
export function TechnicalCard({ result }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const cwvRatingVariant = (r: string) => r === "good" ? "good" : r === "needs-improvement" ? "warning" : "critical";
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const issues = result.issues ?? [];
  const sortedIssues = [...issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-semibold">🔧 Technical SEO</span>
          <span className="font-mono text-lg font-bold" style={{ color: scoreToColor(result.score) }}>{result.score}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CWV */}
        {result.cwv && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Core Web Vitals</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "lcp", label: "LCP", unit: "s", value: (result.cwv.lcp.value / 1000).toFixed(1) },
              { key: "inp", label: "INP", unit: "ms", value: result.cwv.inp.value },
              { key: "cls", label: "CLS", unit: "", value: result.cwv.cls.value },
            ].map(({ key, label, unit, value }) => (
              <div key={key} className="bg-[var(--bg-tertiary)] rounded-lg p-2 text-center">
                <p className="text-xs text-[var(--text-tertiary)] mb-1">{label}</p>
                <p className="font-mono font-bold text-sm">{value}{unit}</p>
                <Badge variant={cwvRatingVariant(result.cwv[key as keyof typeof result.cwv].rating) as "good" | "warning" | "critical"} className="mt-1 text-[9px]">
                  {result.cwv[key as keyof typeof result.cwv].rating}
                </Badge>
              </div>
            ))}
          </div>
        </div>
        )}
        {/* Issues */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Issues ({sortedIssues.length})</p>
          <div className="space-y-2">
            {sortedIssues.slice(0, 5).map((issue, i) => (
              <IssueRow key={i} issue={issue} expanded={expanded === `${i}`} onToggle={() => setExpanded(expanded === `${i}` ? null : `${i}`)} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IssueRow({ issue, expanded, onToggle }: { issue: TechnicalIssue; expanded: boolean; onToggle: () => void }) {
  const severityVariant: Record<TechnicalIssue["severity"], "critical" | "warning" | "info"> = {
    critical: "critical",
    warning: "warning",
    info: "info",
  };
  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
      <button onClick={onToggle} aria-expanded={expanded} className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-[var(--bg-tertiary)] transition-colors">
        <Badge variant={severityVariant[issue.severity]}>{issue.severity}</Badge>
        <span className="text-sm flex-1 text-[var(--text-primary)]">{issue.title}</span>
        <span className="text-xs text-[var(--text-tertiary)]">{(issue.affectedPages ?? []).length}p</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs text-[var(--text-secondary)] space-y-1 border-t border-[var(--border)] pt-2">
          <p>{issue.description}</p>
          <p className="text-[var(--accent)]">💡 {issue.recommendation}</p>
        </div>
      )}
    </div>
  );
}
