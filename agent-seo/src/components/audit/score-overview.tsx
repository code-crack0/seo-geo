// src/components/audit/score-overview.tsx
"use client";
import { useEffect, useState } from "react";
import { scoreToColor, scoreToLabel } from "@/lib/utils";

interface ScoreOverviewProps {
  overall: number | null;
  technical: number | null;
  content: number | null;
  schema: number | null;
  geo: number | null;
}

export function ScoreOverview({ overall: overallRaw, technical, content, schema, geo }: ScoreOverviewProps) {
  // Treat NaN the same as null so SVG attributes never receive NaN
  const overall = overallRaw !== null && Number.isFinite(overallRaw) ? overallRaw : null;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (overall === null) return;
    setDisplayed(0);
    let start = 0;
    const end = overall;
    const duration = 1000;
    const step = (end / duration) * 16;
    const timer = setInterval(() => {
      start = Math.min(start + step, end);
      setDisplayed(Math.round(start));
      if (start >= end) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [overall]);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = overall !== null ? (overall / 100) * circumference : 0;
  const color = overall !== null ? scoreToColor(overall) : "var(--border)";

  const subScores = [
    { label: "Technical", icon: "🔧", value: technical },
    { label: "Content", icon: "📝", value: content },
    { label: "Schema", icon: "🏷️", value: schema },
    { label: "GEO", icon: "🤖", value: geo },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Overall Score</p>
      {/* Ring gauge */}
      <div className="flex flex-col items-center">
        <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={overall !== null ? `Overall score: ${overall}` : "Score not yet available"}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--bg-tertiary)" strokeWidth="10" />
          <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={circumference - progress}
            strokeLinecap="round" transform="rotate(-90 70 70)"
            style={{ transition: "stroke-dashoffset 0.7s ease" }} />
          <text x="70" y="65" textAnchor="middle" fill="var(--text-primary)" fontSize="28" fontWeight="700" fontFamily="var(--font-ibm-plex-mono)">
            {overall !== null ? displayed : "—"}
          </text>
          {overall !== null && (
            <text x="70" y="82" textAnchor="middle" fill={color} fontSize="9" fontWeight="600" letterSpacing="1">
              {scoreToLabel(overall)}
            </text>
          )}
        </svg>
      </div>
      {/* Sub-scores */}
      <div className="grid grid-cols-2 gap-2">
        {subScores.map(({ label, icon, value }) => (
          <div key={label} className="bg-[var(--bg-tertiary)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[var(--text-secondary)]">{icon} {label}</span>
              <span className="text-sm font-semibold font-mono" style={{ color: value !== null ? scoreToColor(value) : "var(--text-tertiary)" }}>
                {value ?? "—"}
              </span>
            </div>
            <div className="h-1 rounded-full bg-[var(--bg-primary)]">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${value ?? 0}%`, backgroundColor: value !== null ? scoreToColor(value) : "transparent" }} />
            </div>
          </div>
        ))}
      </div>
      {/* Contextual warning */}
      {geo !== null && geo < 50 && (
        <p className="text-xs text-amber-400">⚠️ GEO score is dragging your overall performance down. AI engines can barely find you.</p>
      )}
    </div>
  );
}
