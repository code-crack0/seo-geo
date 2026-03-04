// src/components/audit/content-briefs.tsx
"use client";
import { StrategyResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props { briefs: StrategyResult["contentBriefs"] }
export function ContentBriefs({ briefs }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (briefs.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">📄 Content Briefs</h3>
        <Badge>{briefs.length} briefs generated</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {briefs.map((brief, i) => (
          <div key={i} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={brief.geoOptimized ? "accent" : "info"}>
                {brief.geoOptimized ? "GEO Optimized" : "SEO Content"}
              </Badge>
              <Badge variant={brief.estimatedImpact.toLowerCase() === "high" ? "critical" : brief.estimatedImpact.toLowerCase() === "medium" ? "warning" : "default"}>
                {brief.estimatedImpact} Impact
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{brief.title}</p>
              <code className="text-xs bg-[var(--bg-tertiary)] px-2 py-0.5 rounded text-[var(--accent)] font-mono">{brief.targetKeyword}</code>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{brief.rationale}</p>
            {brief.outline.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  aria-expanded={expandedIdx === i}
                  aria-controls={`brief-outline-${i}`}
                  className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {expandedIdx === i ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Outline ({brief.outline.length} sections)
                </button>
                {expandedIdx === i && (
                  <ol id={`brief-outline-${i}`} className="mt-2 space-y-1 list-decimal list-inside">
                    {brief.outline.map((item, j) => (
                      <li key={j} className="text-xs text-[var(--text-secondary)]">{item}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <button type="button" className="mt-auto text-xs font-medium text-[var(--accent)] hover:underline text-left">
              Generate Full Brief →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
