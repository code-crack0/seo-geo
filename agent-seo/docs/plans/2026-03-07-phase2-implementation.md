# Phase 2: Agentic Chat with SEO Skill Tools — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the chat panel from simple RAG into a full agentic system where the user can ask the AI to analyze any URL using the exact same Claude SEO skills (`/seo-audit`, `/seo-geo`, etc.) as tools, with progressive streaming UI.

**Architecture:** `streamText` (Vercel AI SDK) with 10 tools — 4 existing audit RAG tools + 6 new SEO skill tools. Each SEO tool reads its corresponding `.md` skill file verbatim as the Gemini system prompt, fetches the target URL via Playwright HTTP, and streams the report back. Tool progress steps are emitted as custom data stream events and rendered in the chat UI.

**Tech Stack:** Vercel AI SDK v4 (`streamText`, `createDataStreamResponse`, `tool`), Gemini 2.5 Pro, `@ai-sdk/google`, existing `html-parser.ts`, Playwright (via Express server), React, Tailwind CSS

---

## Task 1: Copy SEO Skill `.md` Files Into Project

**Files:**
- Create: `src/lib/skills/seo/seo-audit.md`
- Create: `src/lib/skills/seo/seo-geo.md`
- Create: `src/lib/skills/seo/seo-page.md`
- Create: `src/lib/skills/seo/seo-technical.md`
- Create: `src/lib/skills/seo/seo-content.md`
- Create: `src/lib/skills/seo/seo-schema.md`

**Step 1: Create the skills directory**

```bash
mkdir -p src/lib/skills/seo
```

**Step 2: Copy each skill file from Claude's skills directory**

```bash
cp "C:/Users/Admin3k/.claude/skills/seo-audit/seo-audit.md" src/lib/skills/seo/seo-audit.md
cp "C:/Users/Admin3k/.claude/skills/seo-geo/seo-geo.md" src/lib/skills/seo/seo-geo.md
cp "C:/Users/Admin3k/.claude/skills/seo-page/seo-page.md" src/lib/skills/seo/seo-page.md
cp "C:/Users/Admin3k/.claude/skills/seo-technical/seo-technical.md" src/lib/skills/seo/seo-technical.md
cp "C:/Users/Admin3k/.claude/skills/seo-content/seo-content.md" src/lib/skills/seo/seo-content.md
cp "C:/Users/Admin3k/.claude/skills/seo-schema/seo-schema.md" src/lib/skills/seo/seo-schema.md
```

> Note: If any skill is a directory, copy the main `.md` file from inside it. Check the directory structure first with `ls C:/Users/Admin3k/.claude/skills/`.

**Step 3: Verify all 6 files exist**

```bash
ls src/lib/skills/seo/
```
Expected: 6 `.md` files listed.

**Step 4: Commit**

```bash
git add src/lib/skills/seo/
git commit -m "feat(chat): add SEO skill .md files as tool prompts"
```

---

## Task 2: Build `fetch-url.ts` — Shared URL Fetch Utility

**Files:**
- Create: `src/lib/skills/fetch-url.ts`

This utility fetches the rendered HTML of a URL using Playwright's HTTP client (bypasses CORS/CSP), with a plain `fetch()` fallback if Playwright isn't available.

**Step 1: Create the file**

```typescript
// src/lib/skills/fetch-url.ts
// Fetches URL HTML via Playwright HTTP client (server-side, bypasses CORS/CSP).
// Falls back to plain fetch() if Playwright is unavailable.

import { chromium } from "playwright";

export interface FetchResult {
  html: string;
  url: string;        // final URL after redirects
  status: number;
}

export async function fetchUrl(url: string, timeoutMs = 15_000): Promise<FetchResult> {
  // Try Playwright HTTP client first (gets real server-rendered HTML, bypasses CORS)
  try {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const response = await context.request.get(url, { timeout: timeoutMs });
    const html = await response.text();
    const status = response.status();
    await browser.close();
    return { html, url: response.url(), status };
  } catch {
    // Fallback: plain fetch (may miss JS-rendered content)
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentSEO/1.0)" },
    });
    const html = await res.text();
    return { html, url: res.url, status: res.status };
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors for `fetch-url.ts`.

**Step 3: Commit**

```bash
git add src/lib/skills/fetch-url.ts
git commit -m "feat(chat): add fetchUrl utility with Playwright HTTP + fetch fallback"
```

---

## Task 3: Build 6 SEO Skill Tool Files

**Files:**
- Create: `src/lib/skills/seo-geo.ts`
- Create: `src/lib/skills/seo-audit.ts`
- Create: `src/lib/skills/seo-page.ts`
- Create: `src/lib/skills/seo-technical.ts`
- Create: `src/lib/skills/seo-content.ts`
- Create: `src/lib/skills/seo-schema.ts`

Each tool follows the same pattern: read the `.md` skill file → fetch the URL → call Gemini with the skill as system prompt → return the report. The `onProgress` callback lets the chat route emit step events before the LLM call.

**Step 1: Create `src/lib/skills/seo-geo.ts`**

```typescript
// src/lib/skills/seo-geo.ts
import { readFileSync } from "fs";
import { join } from "path";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { fetchUrl } from "./fetch-url";
import { extractContentSummary } from "@/lib/html-parser";

const SKILL_PROMPT = readFileSync(
  join(process.cwd(), "src/lib/skills/seo/seo-geo.md"),
  "utf-8"
);

export interface SeoToolOptions {
  onProgress?: (step: string) => void;
}

export async function runSeoGeoTool(url: string, opts: SeoToolOptions = {}): Promise<string> {
  opts.onProgress?.(`Fetching ${url}…`);
  const { html, status } = await fetchUrl(url);

  if (status >= 400) {
    return `Could not fetch ${url} — server returned HTTP ${status}. Check the URL is publicly accessible.`;
  }

  const extracted = extractContentSummary(html);
  const pageContext = [
    `URL: ${url}`,
    `Title: ${extracted.title ?? "N/A"}`,
    `Meta description: ${extracted.metaDescription ?? "N/A"}`,
    `H1: ${extracted.h1 ?? "N/A"}`,
    `Word count: ${extracted.wordCount ?? "N/A"}`,
    `Text snippet:\n${extracted.textSnippet ?? ""}`,
  ].join("\n");

  opts.onProgress?.("Running GEO / AI visibility analysis…");

  const { text } = await generateText({
    model: google("gemini-2.5-pro-preview-05-06"),
    system: SKILL_PROMPT,
    prompt: `Analyze this page for GEO / AI search visibility:\n\n${pageContext}\n\nFull HTML (first 40000 chars):\n${html.slice(0, 40_000)}`,
    maxTokens: 8000,
  });

  return text;
}
```

**Step 2: Create the remaining 5 tools using the same pattern**

`src/lib/skills/seo-audit.ts` — change skill file to `seo-audit.md`, progress message to `"Running full SEO audit…"`, function name to `runSeoAuditTool`.

`src/lib/skills/seo-page.ts` — skill file `seo-page.md`, progress `"Running single-page SEO analysis…"`, function `runSeoPageTool`.

`src/lib/skills/seo-technical.ts` — skill file `seo-technical.md`, progress `"Running technical SEO checks…"`, function `runSeoTechnicalTool`.

`src/lib/skills/seo-content.ts` — skill file `seo-content.md`, progress `"Analyzing content quality & E-E-A-T…"`, function `runSeoContentTool`.

`src/lib/skills/seo-schema.ts` — skill file `seo-schema.md`, progress `"Analyzing structured data & schema…"`, function `runSeoSchemaTool`.

> Copy `seo-geo.ts` for each, replacing the 3 values above (skill file name, progress message, function name). Keep all other code identical.

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors across all 6 files.

**Step 4: Commit**

```bash
git add src/lib/skills/seo-geo.ts src/lib/skills/seo-audit.ts src/lib/skills/seo-page.ts src/lib/skills/seo-technical.ts src/lib/skills/seo-content.ts src/lib/skills/seo-schema.ts
git commit -m "feat(chat): add 6 SEO skill tools using skill .md files as prompts"
```

---

## Task 4: Update `src/lib/skills/index.ts` — Export `buildSeoSkills()`

**Files:**
- Modify: `src/lib/skills/index.ts`

**Step 1: Read the current file**

Current content (already known):
```typescript
import { searchAuditSkill } from "./search-audit";
import { getPageDetailsSkill } from "./get-page-details";
import { getTechnicalIssuesSkill } from "./get-technical-issues";
import { getScoreSummarySkill } from "./get-score-summary";

export { searchAuditSkill, getPageDetailsSkill, getTechnicalIssuesSkill, getScoreSummarySkill };

export function buildAuditSkills(auditId: string) {
  return [searchAuditSkill(auditId), getPageDetailsSkill(auditId), getTechnicalIssuesSkill(auditId), getScoreSummarySkill(auditId)];
}
```

**Step 2: Add SEO skill exports**

Replace the entire file with:

```typescript
import { searchAuditSkill } from "./search-audit";
import { getPageDetailsSkill } from "./get-page-details";
import { getTechnicalIssuesSkill } from "./get-technical-issues";
import { getScoreSummarySkill } from "./get-score-summary";

import { runSeoAuditTool } from "./seo-audit";
import { runSeoGeoTool } from "./seo-geo";
import { runSeoPageTool } from "./seo-page";
import { runSeoTechnicalTool } from "./seo-technical";
import { runSeoContentTool } from "./seo-content";
import { runSeoSchemaTool } from "./seo-schema";

export {
  searchAuditSkill, getPageDetailsSkill, getTechnicalIssuesSkill, getScoreSummarySkill,
  runSeoAuditTool, runSeoGeoTool, runSeoPageTool, runSeoTechnicalTool, runSeoContentTool, runSeoSchemaTool,
};

/** LangChain tools for the current audit session (RAG-based) */
export function buildAuditSkills(auditId: string) {
  return [
    searchAuditSkill(auditId),
    getPageDetailsSkill(auditId),
    getTechnicalIssuesSkill(auditId),
    getScoreSummarySkill(auditId),
  ];
}

/** SEO skill runner functions — used as Vercel AI SDK tools in the chat route */
export {
  runSeoAuditTool as seoAudit,
  runSeoGeoTool as seoGeo,
  runSeoPageTool as seoPage,
  runSeoTechnicalTool as seoTechnical,
  runSeoContentTool as seoContent,
  runSeoSchemaTool as seoSchema,
};
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/lib/skills/index.ts
git commit -m "feat(chat): export buildSeoSkills and SEO tool runners from skills index"
```

---

## Task 5: Upgrade `app/api/chat/route.ts` — 10 Tools + Tool Step Streaming

**Files:**
- Modify: `app/api/chat/route.ts`

This is the core upgrade. Replace the single `streamText` call with `createDataStreamResponse` so we can write custom `tool_step` events before tool execution, then merge the `streamText` output into the same stream.

**Step 1: Read the current file** (already done above — 95 lines)

**Step 2: Replace the file entirely**

```typescript
// app/api/chat/route.ts
import { createDataStreamResponse, streamText, tool, type CoreMessage } from "ai";
import { z } from "zod";
import { google } from "@ai-sdk/google";
import { getAuditById } from "@/lib/db";
import { searchChunks } from "@/lib/embeddings";
import type { AuditState } from "@/lib/types";
import {
  runSeoAuditTool,
  runSeoGeoTool,
  runSeoPageTool,
  runSeoTechnicalTool,
  runSeoContentTool,
  runSeoSchemaTool,
} from "@/lib/skills";

const MODEL = google("gemini-2.5-pro-preview-05-06");

function buildSystemPrompt(audit: Awaited<ReturnType<typeof getAuditById>>, contextBlocks: string): string {
  if (!audit) {
    return `You are an expert SEO & GEO assistant. You can analyze any URL using your SEO tools. When a user provides a URL, use the appropriate SEO tool to analyze it.`;
  }

  const overview = [
    audit.domain ? `Domain: ${audit.domain}` : null,
    audit.business_type ? `Business type: ${audit.business_type}` : null,
    audit.overall_score != null ? `Overall score: ${audit.overall_score}` : null,
    audit.technical_score != null ? `Technical: ${audit.technical_score}` : null,
    audit.content_score != null ? `Content: ${audit.content_score}` : null,
    audit.schema_score != null ? `Schema: ${audit.schema_score}` : null,
    audit.geo_score != null ? `GEO AI Visibility: ${audit.geo_score}` : null,
  ].filter(Boolean).join(" | ");

  return `You are an expert SEO & GEO assistant for the audit of ${audit.domain}.

AUDIT OVERVIEW: ${overview}

RELEVANT AUDIT DATA:
${contextBlocks}

You have two types of tools:
1. Audit data tools — search this audit's results, get page details, scores, issues
2. SEO analysis tools — analyze any URL fresh using the full Claude SEO skill (seo_audit, seo_geo, seo_page, seo_technical, seo_content, seo_schema)

When the user asks to analyze a specific URL, use the appropriate SEO tool. When asking about this audit's results, use the audit data tools first.`;
}

export async function POST(req: Request) {
  const { messages, auditId } = await req.json() as {
    messages: CoreMessage[];
    auditId?: string;
  };

  // Build context from audit data
  let audit = null;
  let contextBlocks = "";

  if (auditId) {
    audit = await getAuditById(auditId);
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const rawContent = lastUserMsg?.content;
    const query = typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.filter((p): p is { type: "text"; text: string } => (p as { type: string }).type === "text").map((p) => p.text).join(" ")
        : "SEO audit summary";

    try {
      const chunks = await searchChunks(auditId, query);
      contextBlocks = chunks.map((c) => `[${c.chunkType}] ${c.content}`).join("\n\n");
    } catch {
      if (audit?.results) {
        try {
          const state = (typeof audit.results === "string" ? JSON.parse(audit.results) : audit.results) as AuditState;
          contextBlocks = `Quick wins: ${(state.strategy?.quickWins ?? []).join("; ")}`;
        } catch { /* leave empty */ }
      }
    }
  }

  const systemPrompt = buildSystemPrompt(audit, contextBlocks);

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const result = streamText({
        model: MODEL,
        system: systemPrompt,
        messages,
        maxSteps: 10,
        tools: {
          // ── SEO skill tools ───────────────────────────────────────────────
          seo_audit: tool({
            description: "Run a full SEO audit on any URL. Crawls the page and returns a comprehensive SEO report covering technical, content, schema, and performance. Use when the user asks to 'audit' a site or URL.",
            parameters: z.object({ url: z.string().url().describe("The URL to audit") }),
            execute: async ({ url }) => {
              dataStream.writeData({ type: "tool_start", tool: "seo_audit", url });
              dataStream.writeData({ type: "tool_step", message: `Fetching ${url}…` });
              try {
                const report = await runSeoAuditTool(url, {
                  onProgress: (msg) => dataStream.writeData({ type: "tool_step", message: msg }),
                });
                dataStream.writeData({ type: "tool_complete", tool: "seo_audit" });
                return report;
              } catch (err) {
                return `SEO audit failed: ${String(err)}`;
              }
            },
          }),

          seo_geo: tool({
            description: "Analyze a URL for GEO / AI search visibility — citability score, structural readability, brand signals, AI crawler access, llms.txt. Use when asked about AI Overviews, ChatGPT, Perplexity, or GEO optimization for a specific URL.",
            parameters: z.object({ url: z.string().url().describe("The URL to analyze") }),
            execute: async ({ url }) => {
              dataStream.writeData({ type: "tool_start", tool: "seo_geo", url });
              dataStream.writeData({ type: "tool_step", message: `Fetching ${url}…` });
              try {
                const report = await runSeoGeoTool(url, {
                  onProgress: (msg) => dataStream.writeData({ type: "tool_step", message: msg }),
                });
                dataStream.writeData({ type: "tool_complete", tool: "seo_geo" });
                return report;
              } catch (err) {
                return `GEO analysis failed: ${String(err)}`;
              }
            },
          }),

          seo_page: tool({
            description: "Deep single-page SEO analysis: title, meta, headings, content quality, internal links, on-page optimization. Use when asked to analyze a specific page in detail.",
            parameters: z.object({ url: z.string().url().describe("The page URL to analyze") }),
            execute: async ({ url }) => {
              dataStream.writeData({ type: "tool_start", tool: "seo_page", url });
              dataStream.writeData({ type: "tool_step", message: `Fetching ${url}…` });
              try {
                const report = await runSeoPageTool(url, {
                  onProgress: (msg) => dataStream.writeData({ type: "tool_step", message: msg }),
                });
                dataStream.writeData({ type: "tool_complete", tool: "seo_page" });
                return report;
              } catch (err) {
                return `Page analysis failed: ${String(err)}`;
              }
            },
          }),

          seo_technical: tool({
            description: "Technical SEO check: robots.txt, sitemaps, canonicals, redirects, Core Web Vitals, HTTPS, security headers. Use when asked about technical issues on a specific URL.",
            parameters: z.object({ url: z.string().url().describe("The URL to check") }),
            execute: async ({ url }) => {
              dataStream.writeData({ type: "tool_start", tool: "seo_technical", url });
              dataStream.writeData({ type: "tool_step", message: `Fetching ${url}…` });
              try {
                const report = await runSeoTechnicalTool(url, {
                  onProgress: (msg) => dataStream.writeData({ type: "tool_step", message: msg }),
                });
                dataStream.writeData({ type: "tool_complete", tool: "seo_technical" });
                return report;
              } catch (err) {
                return `Technical analysis failed: ${String(err)}`;
              }
            },
          }),

          seo_content: tool({
            description: "Analyze content quality: E-E-A-T signals, readability, thin content, duplicate content, AI citation readiness. Use when asked about content quality or E-E-A-T for a specific URL.",
            parameters: z.object({ url: z.string().url().describe("The URL to analyze") }),
            execute: async ({ url }) => {
              dataStream.writeData({ type: "tool_start", tool: "seo_content", url });
              dataStream.writeData({ type: "tool_step", message: `Fetching ${url}…` });
              try {
                const report = await runSeoContentTool(url, {
                  onProgress: (msg) => dataStream.writeData({ type: "tool_step", message: msg }),
                });
                dataStream.writeData({ type: "tool_complete", tool: "seo_content" });
                return report;
              } catch (err) {
                return `Content analysis failed: ${String(err)}`;
              }
            },
          }),

          seo_schema: tool({
            description: "Detect and analyze structured data / schema markup: JSON-LD, microdata, validation errors, missing schema opportunities. Use when asked about schema or structured data on a URL.",
            parameters: z.object({ url: z.string().url().describe("The URL to analyze") }),
            execute: async ({ url }) => {
              dataStream.writeData({ type: "tool_start", tool: "seo_schema", url });
              dataStream.writeData({ type: "tool_step", message: `Fetching ${url}…` });
              try {
                const report = await runSeoSchemaTool(url, {
                  onProgress: (msg) => dataStream.writeData({ type: "tool_step", message: msg }),
                });
                dataStream.writeData({ type: "tool_complete", tool: "seo_schema" });
                return report;
              } catch (err) {
                return `Schema analysis failed: ${String(err)}`;
              }
            },
          }),

          // ── Audit RAG tools (existing, only when auditId present) ─────────
          ...(auditId ? {
            search_audit_data: tool({
              description: "Search the current audit's embedded results for specific findings, scores, issues, or recommendations.",
              parameters: z.object({ query: z.string().describe("What to search for in the audit data") }),
              execute: async ({ query }) => {
                try {
                  const chunks = await searchChunks(auditId, query, 8);
                  if (chunks.length === 0) return "No relevant audit data found for that query.";
                  return chunks.map((c) => `[${c.chunkType}] ${c.content}`).join("\n\n---\n\n");
                } catch {
                  return "Could not search audit data — embeddings may not be ready yet.";
                }
              },
            }),
          } : {}),
        },
        onError: (err) => {
          console.error("[chat] streamText error:", err);
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (err) => String(err),
  });
}
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Test the route manually with curl**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"analyze https://example.com for GEO"}],"auditId":null}' \
  --no-buffer -s | head -30
```
Expected: SSE stream with `2:[...]` data lines including `tool_start`, `tool_step` events.

**Step 5: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): upgrade to agentic chat with 6 SEO skill tools + tool step streaming"
```

---

## Task 6: Build `ToolStep` Component + Update `ChatPanel`

**Files:**
- Create: `src/components/chat/tool-step.tsx`
- Modify: `src/components/chat/chat-panel.tsx`

The chat UI needs to display tool progress events (`tool_start`, `tool_step`, `tool_complete`) that arrive in the Vercel AI SDK data stream alongside the regular message tokens.

**Step 1: Create `src/components/chat/tool-step.tsx`**

```tsx
// src/components/chat/tool-step.tsx
"use client";
import { Loader2, CheckCircle, Search } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  seo_audit: "SEO Audit",
  seo_geo: "GEO Analysis",
  seo_page: "Page Analysis",
  seo_technical: "Technical SEO",
  seo_content: "Content Analysis",
  seo_schema: "Schema Analysis",
  search_audit_data: "Searching audit data",
};

export interface ToolStepEvent {
  type: "tool_start" | "tool_step" | "tool_complete";
  tool?: string;
  url?: string;
  message?: string;
}

interface Props {
  events: ToolStepEvent[];
  isComplete: boolean;
}

export function ToolStep({ events, isComplete }: Props) {
  const startEvent = events.find((e) => e.type === "tool_start");
  const toolLabel = startEvent?.tool ? TOOL_LABELS[startEvent.tool] ?? startEvent.tool : "Analyzing";
  const steps = events.filter((e) => e.type === "tool_step");

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        {isComplete ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
        ) : (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        )}
        <span className="font-medium">{toolLabel}</span>
        {startEvent?.url && (
          <span className="truncate opacity-60">{startEvent.url}</span>
        )}
      </div>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] pl-5">
          <Search className="w-3 h-3 opacity-40 shrink-0" />
          <span className="opacity-70">{s.message}</span>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Update `chat-panel.tsx` to handle tool step data events**

The Vercel AI SDK's `useChat` hook exposes a `data` array containing the custom data events written via `dataStream.writeData()`. We need to:
1. Read `data` from `useChat`
2. Group tool events by tool invocation
3. Render `ToolStep` components before the assistant's streaming text

Find and update the `useChat` call and message rendering in `chat-panel.tsx`:

```tsx
// Add `data` to the useChat destructure:
const { messages, input, handleInputChange, handleSubmit, isLoading, append, data } = useChat({
  api: "/api/chat",
  body: { auditId },
});
```

```tsx
// Add this helper above the ChatPanel component:
import { ToolStep, type ToolStepEvent } from "./tool-step";

function groupToolEvents(data: unknown[]): { events: ToolStepEvent[]; isComplete: boolean }[] {
  const groups: { events: ToolStepEvent[]; isComplete: boolean }[] = [];
  let current: ToolStepEvent[] | null = null;

  for (const item of data) {
    const event = item as ToolStepEvent;
    if (event.type === "tool_start") {
      current = [event];
      groups.push({ events: current, isComplete: false });
    } else if (event.type === "tool_step" && current) {
      current.push(event);
    } else if (event.type === "tool_complete" && groups.length > 0) {
      groups[groups.length - 1].isComplete = true;
      current = null;
    }
  }
  return groups;
}
```

```tsx
// In the message list rendering, add tool steps before the last assistant message:
{messages.map((m, idx) => (
  <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
    {/* Show tool steps before the last assistant message while loading */}
    {m.role === "assistant" && idx === messages.length - 1 && data && data.length > 0 && (
      <div className="w-full max-w-[85%] px-3 py-2 rounded-xl bg-[var(--bg-tertiary)]">
        {groupToolEvents(data as unknown[]).map((group, i) => (
          <ToolStep key={i} events={group.events} isComplete={group.isComplete} />
        ))}
      </div>
    )}
    <div
      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
        m.role === "user"
          ? "bg-[var(--accent)] text-black"
          : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] prose prose-sm prose-invert max-w-none"
      }`}
    >
      {m.role === "assistant" ? (
        <ReactMarkdown>{typeof m.content === "string" ? m.content : ""}</ReactMarkdown>
      ) : (
        typeof m.content === "string" ? m.content : ""
      )}
    </div>
  </div>
))}
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

**Step 4: Start the dev server and test manually**

```bash
npm run dev
```

Open http://localhost:3000, complete or open a historical audit, go to chat, type:
```
analyze https://mixbook.com for GEO visibility
```

Expected:
- Tool step UI appears: "GEO Analysis | https://mixbook.com"
- Steps stream: "Fetching...", "Running GEO analysis..."
- Checkmark appears when complete
- Full GEO report streams as markdown below

**Step 5: Commit**

```bash
git add src/components/chat/tool-step.tsx src/components/chat/chat-panel.tsx
git commit -m "feat(chat): add ToolStep component and tool progress UI in ChatPanel"
```

---

## Task 7: Final Validation

**Step 1: TypeScript clean build**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

**Step 2: Test each SEO tool via chat**

In the chat UI, test each tool:
- `"audit https://example.com"` → triggers `seo_audit`
- `"check GEO for https://mixbook.com/about"` → triggers `seo_geo`
- `"analyze this page: https://mixbook.com/pricing"` → triggers `seo_page`
- `"what are the technical SEO issues on https://mixbook.com"` → triggers `seo_technical`
- `"check content quality on https://mixbook.com/blog"` → triggers `seo_content`
- `"what schema does https://mixbook.com have?"` → triggers `seo_schema`

Expected for each: tool step UI → progress steps → full skill-format report.

**Step 3: Test RAG tools still work**

```
"what was the overall SEO score?"
"show me the critical technical issues from the audit"
```
Expected: answers using `search_audit_data` tool, no browser call.

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat: Phase 2 complete — agentic chat with 6 SEO skill tools"
```
