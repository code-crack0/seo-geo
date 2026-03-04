// src/lib/parse-agent-result.ts
// Extracts and repairs JSON from a generateText result, searching all steps in reverse.
// Two failure modes handled:
//   1. maxSteps exhausted: last message is a tool call so result.text is "" — walk steps in reverse
//   2. Output token limit hit: JSON is truncated mid-string — jsonrepair closes open brackets/braces

import { jsonrepair } from "jsonrepair";

export function extractJsonFromResult(result: { text: string; steps: { text: string }[] }): string {
  const candidates = [result.text, ...[...result.steps].reverse().map(s => s.text)];
  for (const text of candidates) {
    if (!text) continue;
    const m =
      text.match(/```json\r?\n([\s\S]+?)\r?\n```/) ??
      text.match(/(\{[\s\S]+\})/);
    if (!m) continue;
    const raw = m[1];
    // First try parsing as-is
    try { JSON.parse(raw); return raw; } catch { /* truncated — fall through to repair */ }
    // Try to repair truncated JSON
    try { const repaired = jsonrepair(raw); JSON.parse(repaired); return repaired; } catch { /* repair failed too */ }
  }
  throw new Error("No structured JSON found in agent response");
}
