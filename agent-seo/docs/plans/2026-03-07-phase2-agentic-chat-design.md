# Phase 2: Agentic Chat with SEO Skill Tools — Design

**Date:** 2026-03-07
**Status:** Approved
**Branch:** feature/langgraph-supervisor

---

## Overview

Upgrade the chat panel from a simple RAG system into a LangGraph ReAct agent that can:
1. Answer questions about the current audit using embedded chunks (existing RAG tools)
2. Analyze any URL on demand by invoking Claude SEO skills directly as LangChain tools

The agent uses the **exact same prompts** from the Claude skill `.md` files — no rewriting. This guarantees the same analysis depth and output format as running `/seo-audit`, `/seo-geo`, etc. in Claude Code.

---

## Architecture

### Agent: LangGraph ReAct

Replace the current `streamText` call in `app/api/chat/route.ts` with a LangGraph ReAct agent (Gemini 2.5 Pro). The agent has 10 tools across two categories:

**Category 1 — Existing audit RAG tools (unchanged):**
- `search_audit_data` — semantic search over embedded audit chunks
- `get_page_details` — fetch stored page details from Supabase
- `get_technical_issues` — get technical issues from the current audit
- `get_score_summary` — get scores from the current audit

**Category 2 — On-demand SEO skill tools (new):**
- `seo_audit(url)` — full site crawl + multi-agent analysis (replicates `/seo-audit`)
- `seo_geo(url)` — GEO/AI visibility analysis (replicates `/seo-geo`)
- `seo_page(url)` — deep single-page analysis (replicates `/seo-page`)
- `seo_technical(url)` — technical SEO checks (replicates `/seo-technical`)
- `seo_content(url)` — E-E-A-T, readability, thin content (replicates `/seo-content`)
- `seo_schema(url)` — schema detection + recommendations (replicates `/seo-schema`)

### Data Flow

```
User chat message
  → LangGraph ReAct agent (Gemini 2.5 Pro)
      → selects tool(s) based on intent
      → [RAG tools] query Supabase embeddings
      → [SEO tools] fetch URL via Playwright HTTP (Express server)
                   → send HTML + full skill .md prompt to Gemini
                   → return structured markdown report
  → stream progressive updates + report tokens to chat UI
```

### URL Fetching Strategy (Approach B)

Each SEO tool fetches the target URL using `page.context().request.get()` — the Playwright HTTP client already used in `playwright.ts`. This:
- Gets real rendered HTML without a full browser session
- Bypasses CORS/CSP (server-side fetch)
- Requires the Express server to be running
- Falls back to plain `fetch()` if Playwright unavailable

### Skill Prompts

Each SEO tool reads its corresponding `.md` file from `src/lib/skills/seo/` and uses it verbatim as the LLM system prompt. The fetched HTML is appended as user content. This guarantees exact parity with the Claude Code skill behavior.

```
system: <full content of seo-geo.md>
user: Analyze this URL: https://example.com/page

Fetched HTML:
<html>...</html>

Return your analysis in the format specified above.
```

---

## Streaming & UI

### Progressive Tool Updates (Option C)

When a skill tool runs, the chat streams three phases:

1. **Status steps** — emitted before the LLM call:
   - "Fetching https://..."
   - "Running GEO analysis..."
   - "Generating report..."

2. **Streaming report** — LLM tokens streamed token-by-token after steps complete

3. **Tool complete** — marks the tool as done

### New Stream Event Types

```typescript
{ type: "tool_start",    tool: "seoGeo", url: "https://..." }
{ type: "tool_step",     message: "Fetching URL..." }
{ type: "tool_step",     message: "Running GEO analysis..." }
{ type: "tool_complete", tool: "seoGeo" }
// then regular streaming tokens
```

### Chat UI Changes

- Tool step messages render as small inline status rows (icon + muted text)
- Report streams as markdown below the status rows in the same bubble
- Existing RAG answers unchanged — only tool-using responses show step UI
- New `ToolStep` component handles the inline progress indicators

---

## Error Handling

All errors surface as readable chat messages — no silent failures:

| Failure | User-visible message |
|---------|---------------------|
| URL fetch fails (404, timeout) | "Couldn't fetch [url] — check it's publicly accessible" |
| LLM analysis fails | Falls back to raw extracted data (title, meta, headings) with note |
| Playwright unavailable | Falls back to plain `fetch()` HTTP, continues with reduced HTML |
| Tool takes >60s | Timeout message, suggests narrower scope (e.g. `seo_page` instead of `seo_audit`) |

---

## File Structure

```
src/lib/skills/seo/
  seo-audit.md             <- copied from ~/.claude/skills/seo-audit/
  seo-geo.md               <- copied from ~/.claude/skills/seo-geo/
  seo-page.md              <- copied from ~/.claude/skills/seo-page/
  seo-technical.md         <- copied from ~/.claude/skills/seo-technical/
  seo-content.md           <- copied from ~/.claude/skills/seo-content/
  seo-schema.md            <- copied from ~/.claude/skills/seo-schema/

src/lib/skills/
  seo-audit.ts             <- LangChain tool: reads seo-audit.md, fetches URL, calls Gemini
  seo-geo.ts
  seo-page.ts
  seo-technical.ts
  seo-content.ts
  seo-schema.ts
  fetch-url.ts             <- shared: Playwright HTTP fetch with plain fetch() fallback
  index.ts                 <- exports buildAuditSkills() + buildSeoSkills()

  (existing)
  search-audit.ts
  get-page-details.ts
  get-technical-issues.ts
  get-score-summary.ts

app/api/chat/route.ts      <- replace streamText with LangGraph ReAct agent

src/components/chat/
  chat-panel.tsx           <- add tool step rendering
  tool-step.tsx            <- new: inline tool progress indicator component
```

---

## Multi-turn Memory

The ReAct agent uses `MemorySaver` keyed by `auditId` — same pattern as the audit graph. This persists the conversation so the agent remembers previous tool results within the same audit session.

---

## Implementation Tasks

1. Copy SEO skill `.md` files into `src/lib/skills/seo/`
2. Build `fetch-url.ts` — Playwright HTTP fetch utility with fallback
3. Build 6 SEO skill tools (`seo-audit.ts` … `seo-schema.ts`)
4. Update `src/lib/skills/index.ts` — export `buildSeoSkills()`
5. Rewrite `app/api/chat/route.ts` — LangGraph ReAct agent with all 10 tools
6. Add `tool_start` / `tool_step` / `tool_complete` stream event handling to chat store
7. Build `ToolStep` component and update `ChatPanel` to render tool steps
