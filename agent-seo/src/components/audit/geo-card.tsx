// src/components/audit/geo-card.tsx
"use client";
import { GEOResult } from "@/lib/types";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scoreToColor } from "@/lib/utils";

const GEO_LABELS = [
  { max: 25, label: "BARELY VISIBLE", color: "#ef4444" },
  { max: 50, label: "EMERGING", color: "#f59e0b" },
  { max: 75, label: "VISIBLE", color: "#4ade80" },
  { max: 100, label: "AUTHORITY", color: "#22c55e" },
];

const ENGINES = [
  { key: "perplexity" as const, label: "Perplexity" },
  { key: "google_ai" as const, label: "Google AI" },
  { key: "you_com" as const, label: "You.com" },
];

const CITE_DIMS = [
  { key: "clarity" as const, label: "Clarity" },
  { key: "intent" as const, label: "Intent" },
  { key: "trust" as const, label: "Trust" },
  { key: "evidence" as const, label: "Evidence" },
];

interface Props { result: GEOResult }
export function GEOCard({ result }: Props) {
  const mentions = result.mentions ?? [];
  const citeScore = result.citeScore ?? { clarity: 0, intent: 0, trust: 0, evidence: 0 };
  const citationGaps = result.citationGaps ?? [];
  const recommendations = result.recommendations ?? [];
  // Guard against NaN/undefined — SVG attributes reject NaN silently in some browsers
  const score = Number.isFinite(result.aiVisibilityScore) ? result.aiVisibilityScore : 0;
  const visLabel = GEO_LABELS.find(l => score <= l.max) ?? GEO_LABELS[GEO_LABELS.length - 1];
  const color = scoreToColor(score);

  // Arc gauge: 270° arc, starts at 135° (bottom-left), goes clockwise
  const cx = 80, cy = 80, r = 60;
  const startAngle = 135; // degrees
  const totalArc = 270; // degrees

  // Convert degrees to radians for SVG path
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const describeArc = (startDeg: number, endDeg: number) => {
    const s = { x: cx + r * Math.cos(toRad(startDeg)), y: cy + r * Math.sin(toRad(startDeg)) };
    const e = { x: cx + r * Math.cos(toRad(endDeg)), y: cy + r * Math.sin(toRad(endDeg)) };
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  // Use minimum 0.001 to avoid degenerate path when score === 0
  const progressRatio = score === 0 ? 0.001 : score / 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-semibold">🤖 AI Visibility (GEO)</span>
          <span className="font-mono text-lg font-bold" style={{ color }}>{score}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Arc gauge */}
        <div className="flex flex-col items-center">
          <svg width="160" height="110" viewBox="0 0 160 110" role="img" aria-label={`AI Visibility Score: ${score} - ${visLabel.label}`}>
            <path d={describeArc(startAngle, startAngle + totalArc)} fill="none" stroke="var(--bg-tertiary)" strokeWidth="10" strokeLinecap="round" />
            <path d={describeArc(startAngle, startAngle + progressRatio * totalArc)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={{ transition: "stroke-dasharray 0.7s ease" }} />
            <text x="80" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="24" fontWeight="700" fontFamily="var(--font-ibm-plex-mono)">{score}</text>
            <text x="80" y="88" textAnchor="middle" fill={visLabel.color} fontSize="9" fontWeight="600" letterSpacing="1">{visLabel.label}</text>
          </svg>
        </div>

        {/* Per-engine breakdown */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">AI Engine Visibility</p>
          <div className="grid grid-cols-3 gap-2">
            {ENGINES.map(({ key, label }) => {
              const engineMentions = mentions.filter(m => m.engine === key);
              const mentioned = engineMentions.filter(m => m.mentioned).length;
              const total = engineMentions.length;
              return (
                <div key={key} className="bg-[var(--bg-tertiary)] rounded-lg p-2 text-center">
                  <p className="text-[10px] text-[var(--text-tertiary)] mb-1">{label}</p>
                  <p className="font-mono font-bold text-sm" style={{ color: total === 0 ? "var(--text-tertiary)" : scoreToColor((mentioned / total) * 100) }}>{mentioned}/{total}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">queries</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* CITE scores */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">CITE Framework</p>
          <div className="space-y-1.5">
            {CITE_DIMS.map(({ key, label }) => {
              const val = Number.isFinite(citeScore[key]) ? citeScore[key] : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                    <span className="text-xs font-mono" style={{ color: scoreToColor(val) }}>{val}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-tertiary)]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${val}%`, backgroundColor: scoreToColor(val) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Citation gaps */}
        {citationGaps.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Citation Gaps</p>
            <div className="space-y-2">
              {citationGaps.slice(0, 2).map((gap, i) => (
                <div key={i} className="bg-[var(--bg-tertiary)] rounded-lg p-2.5">
                  <p className="text-xs font-medium text-[var(--text-primary)] mb-1">{gap.topic}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{gap.opportunity}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">GEO Recommendations</p>
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
