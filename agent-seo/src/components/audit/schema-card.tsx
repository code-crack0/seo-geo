// src/components/audit/schema-card.tsx
"use client";
import { SchemaResult } from "@/lib/types";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scoreToColor } from "@/lib/utils";

interface Props { result: SchemaResult }
export function SchemaCard({ result }: Props) {
  const detected = result.detected ?? [];
  const missing = result.missing ?? [];
  const deprecated = result.deprecated ?? [];
  const depTypes = new Set(deprecated.map(d => d.type));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="font-semibold">🏷️ Schema Markup</span>
          <span className="font-mono text-lg font-bold" style={{ color: scoreToColor(result.score) }}>{result.score}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Detected — grouped by type with counts */}
        {detected.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Detected ({detected.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(
                detected.reduce<Record<string, { count: number; valid: boolean; deprecated: boolean }>>((acc, s) => {
                  const key = s.type;
                  if (!acc[key]) acc[key] = { count: 0, valid: s.valid, deprecated: depTypes.has(s.type) };
                  acc[key].count++;
                  if (!s.valid) acc[key].valid = false;
                  return acc;
                }, {})
              ).map(([type, { count, valid, deprecated }]) => (
                <Badge key={type} variant={!valid ? "critical" : deprecated ? "warning" : "good"}>
                  {type}{count > 1 ? ` ×${count}` : ""}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {/* Missing */}
        {missing.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Missing</p>
            <div className="space-y-1.5">
              {missing.slice(0, 4).map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant={m.priority === "high" ? "critical" : m.priority === "medium" ? "warning" : "default"}>{m.priority}</Badge>
                  <span className="text-xs text-[var(--text-secondary)]">{m.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Deprecated */}
        {deprecated.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-500 uppercase mb-2">⚠️ Deprecated</p>
            <div className="space-y-1">
              {deprecated.map((d, i) => (
                <p key={i} className="text-xs text-[var(--text-secondary)]">
                  <span className="text-amber-400">{d.type}</span> → use <span className="text-[var(--accent)]">{d.replacement}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
