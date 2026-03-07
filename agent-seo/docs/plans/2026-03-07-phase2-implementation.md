# Phase 2: Agentic Chat with SEO Skill Tools — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the chat panel from simple RAG into a full agentic system where the user can ask the AI to analyze any URL using the exact same Claude SEO skills (`/seo-audit`, `/seo-geo`, etc.) as tools, with progressive streaming UI.

**Architecture:** LangGraph `createReactAgent` with `ChatGoogleGenerativeAI` (LangChain) as the chat agent. All 10 tools use `tool()` from `@langchain/core/tools` — the 4 existing audit RAG tools plug in directly (already LangChain tools). The 6 new SEO tools read their `.md` skill file verbatim as the system prompt, fetch the URL via Playwright HTTP, and call Gemini. `MemorySaver` persists conversation history per `auditId`. The HTTP response uses `createDataStreamResponse` (Vercel AI SDK) only as the SSE bridge — LangGraph's `streamEvents()` is mapped to the `0:"token"\n` / `2:[data]\n` format that `useChat` on the frontend already understands.

**Tech Stack:** `@langchain/langgraph` (`createReactAgent`, `MemorySaver`), `@langchain/google-genai` (`ChatGoogleGenerativeAI`), `@langchain/core/tools` (`tool`), Vercel AI SDK v4 (`createDataStreamResponse` for HTTP only), Gemini 2.5 Pro, existing `html-parser.ts`, Playwright HTTP client, React, Tailwind CSS

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

Each SEO tool is a **LangChain tool** (`tool()` from `@langchain/core/tools`) that closes over a `dataStream` reference for emitting progress events. The tool runner function stays separate so it can be called with or without a stream.

**Step 1: Create `src/lib/skills/seo-geo.ts`**

```typescript
// src/lib/skills/seo-geo.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { fetchUrl } from "./fetch-url";
import { extractContentSummary } from "@/lib/html-parser";
import type { DataStreamWriter } from "ai";

const SKILL_PROMPT = readFileSync(
  join(process.cwd(), "src/lib/skills/seo/seo-geo.md"),
  "utf-8"
);

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-pro-preview-05-06",
  maxOutputTokens: 8000,
});

/** Core runner — can be called standalone or from the LangChain tool */
export async function runSeoGeoTool(
  url: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  onProgress?.(`Fetching ${url}…`);
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

  onProgress?.("Running GEO / AI visibility analysis…");

  const response = await llm.invoke([
    new SystemMessage(SKILL_PROMPT),
    new HumanMessage(
      `Analyze this page for GEO / AI search visibility:\n\n${pageContext}\n\nFull HTML (first 40000 chars):\n${html.slice(0, 40_000)}`
    ),
  ]);

  return typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);
}

/** LangChain tool factory — closes over dataStream for progress events */
export function makeSeoGeoTool(dataStream: DataStreamWriter) {
  return tool(
    async ({ url }: { url: string }) => {
      dataStream.writeData({ type: "tool_start", tool: "seo_geo", url });
      try {
        const report = await runSeoGeoTool(url, (msg) =>
          dataStream.writeData({ type: "tool_step", message: msg })
        );
        dataStream.writeData({ type: "tool_complete", tool: "seo_geo" });
        return report;
      } catch (err) {
        return `GEO analysis failed: ${String(err)}`;
      }
    },
    {
      name: "seo_geo",
      description:
        "Analyze a URL for GEO / AI search visibility — citability score, structural readability, brand signals, AI crawler access, llms.txt. Use when asked about AI Overviews, ChatGPT, Perplexity, or GEO optimization for a specific URL.",
      schema: z.object({ url: z.string().url().describe("The URL to analyze") }),
    }
  );
}
```

**Step 2: Create the remaining 5 tools using the same pattern**

`src/lib/skills/seo-audit.ts` — skill `seo-audit.md`, progress `"Running full SEO audit…"`, tool name `"seo_audit"`, description mentions full site crawl + multi-agent analysis.

`src/lib/skills/seo-page.ts` — skill `seo-page.md`, progress `"Running single-page SEO analysis…"`, tool name `"seo_page"`.

`src/lib/skills/seo-technical.ts` — skill `seo-technical.md`, progress `"Running technical SEO checks…"`, tool name `"seo_technical"`.

`src/lib/skills/seo-content.ts` — skill `seo-content.md`, progress `"Analyzing content quality & E-E-A-T…"`, tool name `"seo_content"`.

`src/lib/skills/seo-schema.ts` — skill `seo-schema.md`, progress `"Analyzing structured data & schema…"`, tool name `"seo_schema"`.

> Copy `seo-geo.ts` for each, replacing: skill filename, `onProgress` message, tool `name`, tool `description`, function names (`runSeoXxxTool` / `makeSeoXxxTool`). All other code identical.

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

**Step 2: Add SEO skill exports and `buildAllChatTools` factory**

Replace the entire file with:

```typescript
import { searchAuditSkill } from "./search-audit";
import { getPageDetailsSkill } from "./get-page-details";
import { getTechnicalIssuesSkill } from "./get-technical-issues";
import { getScoreSummarySkill } from "./get-score-summary";
import { makeSeoAuditTool } from "./seo-audit";
import { makeSeoGeoTool } from "./seo-geo";
import { makeSeoPageTool } from "./seo-page";
import { makeSeoTechnicalTool } from "./seo-technical";
import { makeSeoContentTool } from "./seo-content";
import { makeSeoSchemaTool } from "./seo-schema";
import type { DataStreamWriter } from "ai";

export {
  searchAuditSkill,
  getPageDetailsSkill,
  getTechnicalIssuesSkill,
  getScoreSummarySkill,
  makeSeoAuditTool,
  makeSeoGeoTool,
  makeSeoPageTool,
  makeSeoTechnicalTool,
  makeSeoContentTool,
  makeSeoSchemaTool,
};

/** LangChain RAG tools for the current audit session */
export function buildAuditSkills(auditId: string) {
  return [
    searchAuditSkill(auditId),
    getPageDetailsSkill(auditId),
    getTechnicalIssuesSkill(auditId),
    getScoreSummarySkill(auditId),
  ];
}

/**
 * All 10 chat tools: 4 audit RAG tools + 6 SEO skill tools.
 * Pass dataStream so SEO tools can emit progress events.
 */
export function buildAllChatTools(auditId: string, dataStream: DataStreamWriter) {
  return [
    ...buildAuditSkills(auditId),
    makeSeoAuditTool(dataStream),
    makeSeoGeoTool(dataStream),
    makeSeoPageTool(dataStream),
    makeSeoTechnicalTool(dataStream),
    makeSeoContentTool(dataStream),
    makeSeoSchemaTool(dataStream),
  ];
}
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

## Task 5: Upgrade `app/api/chat/route.ts` — LangGraph ReAct Agent

**Files:**
- Modify: `app/api/chat/route.ts`

Replace `streamText` with a LangGraph `createReactAgent`. The agent uses all 10 LangChain tools and `MemorySaver` for conversation persistence. Streaming bridges LangGraph's `streamEvents()` to the Vercel AI SDK data stream format so `useChat` on the frontend keeps working unchanged.

**Step 1: Read the current file** (already done above — 95 lines)

**Step 2: Replace the file entirely**

```typescript
// app/api/chat/route.ts
import { createDataStreamResponse } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getAuditById } from "@/lib/db";
import { searchChunks } from "@/lib/embeddings";
import { buildAllChatTools } from "@/lib/skills";
import type { AuditState } from "@/lib/types";

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-pro-preview-05-06",
  streaming: true,
});

// Shared in-memory checkpointer — persists conversation per auditId across messages
const checkpointer = new MemorySaver();

function buildSystemPrompt(
  audit: Awaited<ReturnType<typeof getAuditById>>,
  contextBlocks: string
): string {
  if (!audit) {
    return `You are an expert SEO & GEO assistant. You can analyze any URL using your built-in SEO tools (seo_audit, seo_geo, seo_page, seo_technical, seo_content, seo_schema). When a user provides a URL, call the appropriate tool to analyze it.`;
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

You have two categories of tools:
1. Audit data tools (search_audit_data, get_page_details, get_technical_issues, get_score_summary) — query THIS audit's stored results
2. SEO analysis tools (seo_audit, seo_geo, seo_page, seo_technical, seo_content, seo_schema) — fetch and analyze ANY URL fresh using the full SEO skill

When the user asks about this audit's results, use category 1 tools first. When the user asks to analyze a specific URL or compare pages, use category 2 tools.`;
}

export async function POST(req: Request) {
  const { messages, auditId } = (await req.json()) as {
    messages: { role: string; content: string }[];
    auditId?: string;
  };

  // Retrieve audit context for the system prompt
  let audit = null;
  let contextBlocks = "";

  if (auditId) {
    audit = await getAuditById(auditId);
    const lastUserContent = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    try {
      const chunks = await searchChunks(auditId, lastUserContent);
      contextBlocks = chunks.map((c) => `[${c.chunkType}] ${c.content}`).join("\n\n");
    } catch {
      if (audit?.results) {
        try {
          const state = (typeof audit.results === "string"
            ? JSON.parse(audit.results)
            : audit.results) as AuditState;
          contextBlocks = `Quick wins: ${(state.strategy?.quickWins ?? []).join("; ")}`;
        } catch { /* leave empty */ }
      }
    }
  }

  const systemPrompt = buildSystemPrompt(audit, contextBlocks);
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const threadId = auditId ?? `anon-${Date.now()}`;

  return createDataStreamResponse({
    execute: async (dataStream) => {
      // Build all 10 tools — SEO tools close over dataStream for progress events
      const tools = buildAllChatTools(auditId ?? "", dataStream);

      const agent = createReactAgent({
        llm,
        tools,
        checkpointSaver: checkpointer,
        stateModifier: new SystemMessage(systemPrompt),
      });

      // streamEvents gives us fine-grained LLM token + tool events
      const eventStream = agent.streamEvents(
        { messages: [new HumanMessage(lastUserMessage)] },
        {
          version: "v2",
          configurable: { thread_id: threadId },
        }
      );

      // Bridge LangGraph events → Vercel AI SDK data stream format
      // Text tokens → "0:\"token\"\n" so useChat renders them
      // Tool data events already written directly by the tool via dataStream.writeData()
      for await (const event of eventStream) {
        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;
          const content = typeof chunk?.content === "string" ? chunk.content : "";
          if (content) {
            // Vercel AI SDK text token format
            dataStream.write(`0:${JSON.stringify(content)}\n`);
          }
        }
      }

      // Write finish signal
      dataStream.write(
        `e:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 }, isContinued: false })}\n`
      );
      dataStream.write(
        `d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 } })}\n`
      );
    },
    onError: (err) => {
      console.error("[chat] agent error:", err);
      return String(err);
    },
  });
}
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Test the agent manually**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"check GEO for https://example.com"}]}' \
  --no-buffer -s | head -20
```
Expected: stream of `0:"..."` lines (text tokens) and `2:[{"type":"tool_start"...}]` data events.

**Step 5: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): replace streamText with LangGraph createReactAgent (LangChain full shift)"
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
