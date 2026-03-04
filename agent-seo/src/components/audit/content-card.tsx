// src/components/audit/content-card.tsx
"use client";
import { ContentResult } from "@/lib/types";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { scoreToColor } from "@/lib/utils";

const EEAT_DIMS = [
  { key: "experience", label: "Experience" },
  { key: "expertise", label: "Expertise" },
  { key: "authoritativeness", label: "Authority" },
  { key: "trustworthiness", label: "Trust" },
] as const;

interface Props { result: ContentResult }
export function ContentCard({ result }: Props) {
  const eeat = result.eeat;
  const thinPages = result.thinPages ?? [];
  const recommendations = result.recommendations ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-semibold">📝 Content Quality</span>
          <span className="font-mono text-lg font-bold" style={{ color: scoreToColor(result.score) }}>{result.score}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* E-E-A-T */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">E-E-A-T Signals</p>
          <div className="space-y-2">
            {EEAT_DIMS.map(({ key, label }) => {
              const dim = eeat?.[key] ?? { score: 0 };
              return (
                <div key={key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                    <span className="text-xs font-mono font-semibold" style={{ color: scoreToColor(dim.score) }}>{dim.score}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--bg-tertiary)]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${dim.score}%`, backgroundColor: scoreToColor(dim.score) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Thin pages */}
        {thinPages.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Thin Pages ({thinPages.length})</p>
            <div className="space-y-1">
              {thinPages.slice(0, 3).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)] truncate max-w-[180px]">{p.url}</span>
                  <span className="text-[var(--text-tertiary)] shrink-0 ml-2">{p.wordCount}w</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Recommendations</p>
            <ul className="space-y-1">
              {recommendations.slice(0, 3).map((r, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-[var(--accent)] shrink-0">→</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
