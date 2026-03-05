# AgentSEO — CLAUDE.md

> **Rule:** Always update this file after every change to the project.

## Project Overview

AgentSEO is a multi-agent SEO/GEO audit web app built with Next.js 16 + React 19. It runs a live browser in the cloud (Browserbase), orchestrates parallel AI agents, and streams results + screenshots to the frontend in real time.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19
- **Browser automation:** Browser-Use Cloud (`browser-use-sdk`) + Playwright over CDP
- **AI:** Vercel AI SDK v4 (`ai`), `@ai-sdk/google` (Gemini 2.5 Pro), `@ai-sdk/openai` (embeddings)
- **State:** Zustand v5
- **DB:** Supabase PostgreSQL via `@supabase/supabase-js` (replaces better-sqlite3 + Drizzle)
- **Styling:** Tailwind CSS v4, Framer Motion, Lucide icons, `react-markdown`

## Directory Structure

```
agent-seo/
├── src/
│   ├── agents/          # AI agents (supervisor, crawler, technical, content, schema, geo, strategist)
│   ├── components/
│   │   ├── audit/       # Live browser, dashboard, cards, skeletons, agent timeline
│   │   ├── chat/        # Chat panel (right sidebar)
│   │   └── ui/          # Shadcn-style primitives
│   ├── lib/
│   │   ├── browserbase.ts   # Browser-Use Cloud session + Playwright CDP attachment
│   │   ├── types.ts         # All shared TypeScript types and stream event union
│   │   ├── ai.ts            # Gemini client setup (google, defaultModel)
│   │   ├── supabase.ts      # Supabase client (service role, server-side only)
│   │   ├── db.ts            # Supabase-backed DB helpers (async, replaces SQLite/Drizzle)
│   │   └── embeddings.ts    # RAG: buildChunks (async), embedAndStore, searchChunks
│   ├── stores/
│   │   └── audit-store.ts   # Zustand store — handles all SSE stream events
│   └── tools/
│       ├── playwright.ts    # Playwright tools (navigate, extract, screenshot, popup detection)
│       ├── screenshot.ts    # Screenshot utility
│       └── extractors.ts    # Page data + performance JS scripts
├── server/                  # Express backend (deployed to Railway)
│   ├── index.ts             # Express server entry point
│   └── routes/
│       ├── audit.ts         # POST /api/audit — SSE streaming (long-running, ~3-10 min)
│       └── embed.ts         # POST /api/embed + GET /api/embed/status
├── app/
│   └── api/
│       ├── audit/route.ts          # PUT: fast record creation (Vercel, < 1s)
│       ├── chat/route.ts           # POST: RAG chat streaming (Vercel, < 10s)
│       ├── embed/route.ts          # POST: proxy to Railway backend
│       ├── embed/status/route.ts   # GET: returns { ready: boolean }
│       └── history/route.ts        # GET: list recent audits
├── supabase/migrations/
│   └── 001_initial.sql      # Run in Supabase SQL editor to create tables
├── docs/
│   └── plans/               # Implementation plans (YYYY-MM-DD-*.md)
├── .env.example             # All required environment variables documented
├── railway.toml             # Railway deployment config (runs npm run server)
├── .env.local               # GEMINI_API_KEY, BROWSERUSE_API_KEY, OPENAI_API_KEY, etc.
└── package.json
```

## Deployment Architecture

```
Browser (user)
  ├── Vercel (free) — Next.js frontend + lightweight API routes
  │     PUT  /api/audit         → create DB record (< 1s)
  │     GET  /api/embed/status  → check embedding readiness
  │     POST /api/embed         → proxy to Railway backend
  │     POST /api/chat          → RAG chat (< 10s)
  │     GET  /api/history       → list audits
  │
  ├── Railway — Express backend (long-running)
  │     POST /api/audit         → run supervisor + stream SSE (3-10 min)
  │     POST /api/embed         → build + store embeddings
  │     GET  /api/embed/status  → check embedding readiness
  │
  └── Supabase — PostgreSQL
        audits, crawled_pages, chunk_embeddings tables
```

**Key env vars:**
- `NEXT_PUBLIC_BACKEND_URL` — Railway URL (exposed to browser for SSE connection)
- `BACKEND_URL` — Railway URL (server-side, for Vercel proxy routes)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — both on Vercel and Railway
- `APP_URL` — Railway URL (used by supervisor.ts to fire `/api/embed` after audit)

## Architecture

### Browser Session Flow
1. `supervisor.ts` calls `initBrowser()` → creates Browser-Use Cloud session via `browser-use-sdk`
2. SDK returns `{ id, cdpUrl, liveUrl }` — `cdpUrl` is the CDP WebSocket endpoint
3. Playwright attaches over CDP via `chromium.connectOverCDP(session.cdpUrl)`
4. Session metadata (`sessionId`, `liveUrl`) streamed to frontend via `browser_session` event
5. `getMainPage()` returns the first Playwright page (for crawler agent)
6. `getNewBrowserPage()` opens additional tabs for parallel agents

### Streaming
- API route (`/api/audit`) uses Vercel AI SDK `createDataStreamResponse`
- All events emitted via `dataStream.writeData(event)` as SSE
- Frontend (`audit-dashboard.tsx`) reads SSE and dispatches to `useAuditStore().handleStreamEvent()`
- Stream event format: `2:[{type, ...}]` (Vercel AI SDK data stream protocol)

### Stream Event Types (from `src/lib/types.ts`)
| Event | Purpose |
|-------|---------|
| `browser_session` | Session URLs sent once at startup |
| `browser_frame` | JPEG screenshot (base64) for Snapshots tab |
| `log` | Agent log entry for Logs tab |
| `popup_report` | Cookie/modal banner detection results |
| `agent_status` | Agent running/done/error |
| `partial_result` | Agent result data |
| `score_update` | Category score updates |
| `audit_complete` | Final audit state |

### Live Browser View (IMPORTANT)
- **Iframe uses `liveUrl`** — the Browser-Use embeddable live view URL
  - Format: `https://live.browser-use.com?wss=https%3A%2F%2F{id}.cdp0.browser-use.com`
  - This IS embeddable in an iframe (no X-Frame-Options restrictions)
- The `liveUrl` is sent via the `browser_session` stream event and stored in `browserLiveUrl` in the Zustand store
- **`cdpUrl`** (e.g. `https://{id}.cdp0.browser-use.com`) is used only internally by Playwright to attach over CDP

### Browser-Use Cloud API Notes
- `new BrowserUse({ apiKey })` → create SDK client with `BROWSERUSE_API_KEY`
- `client.browsers.create({})` → returns `{ id, cdpUrl, liveUrl, status, timeoutAt, ... }`
- `client.browsers.stop(sessionId)` → terminates the session
- Playwright connects via `chromium.connectOverCDP(session.cdpUrl)`
- Context available as `browser.contexts()[0]` after connecting

## Agent Pipeline

```
Supervisor
├── Step 1: Crawler (sequential, uses main page)
└── Step 2: Parallel analysis
    ├── Technical agent (own page)
    ├── Content agent (no browser)
    ├── Schema agent (own page)
    └── GEO agent (own page — searches Perplexity + Google)
Step 3: Strategist (no browser, synthesizes results)
```

### Chat RAG (Retrieval-Augmented Generation)

After audit completes, agent results are chunked and embedded for low-token semantic search:

```
Audit completes → supervisor fires POST /api/embed (fire-and-forget)
→ buildChunks() creates ~80-200 text chunks from all agent results + page summaries
→ embedMany() batches via text-embedding-3-small (OpenAI, 1536 dims)
→ Stored in chunk_embeddings SQLite table as Float32Array BLOBs
→ User chat message → embed query → cosine similarity → top-8 chunks (~2K tokens)
→ streamText with compact overview (~200 tokens) + top-8 chunks + getPageDetails tool
```

**Token budget per chat message:** ~4,600 tokens (vs ~40,000 for full audit dump)

**Chunk types stored:** `overview`, `technical_issues`, `technical_cwv`, `content_eeat`,
`content_thin_pages`, `schema_detected`, `schema_missing`, `geo_mentions`, `geo_citation_gaps`,
`geo_cite_score`, `recommendations`, `strategy_actions`, `strategy_quick_wins`, `page_summary`

**Historical audit support:** `useEmbedStatus` hook in `ChatPanel` checks `/api/embed/status`
on mount — if not ready, auto-triggers `/api/embed` once (handles audits run before RAG existed).
The `triggered` ref prevents React StrictMode double-invocation.

**Chat tools available to LLM:** `getPageDetails(url)` — returns title, meta, h1, wordCount from SQLite.

**Environment variable:** `APP_URL` (server-side only, NOT `NEXT_PUBLIC_`). Defaults to `http://localhost:3000`.

## Key Patterns

### Screenshot Streaming
`startScreenshotStream(page, dataStream, label, intervalMs)` in `playwright.ts` — starts a setInterval-style loop that captures JPEG frames every ~700ms and emits `browser_frame` events. Call the returned stop function when navigation completes.

### Resilient Navigation
`navigateRobust(page, url)` — tries `domcontentloaded`, retries with `commit` on ERR_ABORTED/timeout.

### Popup Detection + Dismissal
`detectAndDismissPopups(page, dataStream, url)` — detects cookie banners/modals via JS evaluation, emits `popup_report`, then attempts to dismiss them.

## Environment Variables

```env
GEMINI_API_KEY=...
BROWSERUSE_API_KEY=...
OPENAI_API_KEY=...       # Used for text-embedding-3-small (chat RAG)
APP_URL=http://localhost:3000  # Server-side base URL for supervisor → /api/embed trigger
```

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
```

## Recent Changes

- **Fixed: chat RAG not available after live audit** (`src/agents/supervisor.ts`) — `audit_complete` event was emitted BEFORE the DB save, so when the client's `useEmbedStatus` hook immediately called `/api/embed` on receiving the event, the embed route returned 404 "audit not found". The client set `triggered.current = true` and never retried. Fix: moved `audit_complete` emit to AFTER the DB save and after the server-side fire-and-forget embed kick-off. New order: emit `partial_result`/`score_update` → DB save → fire embed → emit `audit_complete`. Client now always finds data in DB and embeddings are already building when it starts polling.

- **Custom scrollbars** (`app/globals.css`) — global thin scrollbars matching the dark theme: `scrollbar-width: thin` + `scrollbar-color` for Firefox; `::-webkit-scrollbar` (5px, transparent track, `--border-active` thumb, `--text-tertiary` on hover, rounded) for Chromium/Safari. Applies to all three scroll areas (main content, left sidebar, chat/logs) without touching individual components.

- **UI improvements — result cards and strategy output**
  - `src/agents/prompts/strategist.md` — added explicit JSON schema example with CRITICAL field name rules (`action` not `title`, `details` not `why`/`description`, lowercase `impact`/`effort`, `category` as union). Prevents LLM from using non-standard field names.
  - `src/components/audit/actions-list.tsx` — rewritten with `normalizeAction()` to handle old LLM field names (`title`→`action`, `what`+`why`→`details`, uppercased `impact`/`effort`). Layout changed from opaque 3-col grid to vertical expand/collapse list — action text always visible, details revealed on click.
  - `src/components/audit/schema-card.tsx` — detected schema types now grouped by `type` with a `reduce` → single badge per type with `×N` count suffix when N > 1. Eliminates cluttered duplicate pills (e.g. 8× BreadcrumbList → one "BreadcrumbList ×8" badge).
  - `src/components/audit/geo-card.tsx` — CITE framework progress bars changed from `h-1 bg-[var(--bg-primary)]` to `h-2 bg-[var(--bg-tertiary)]` for visibility.
  - `src/components/audit/content-briefs.tsx` — layout changed from horizontal `overflow-x-auto` flex with fixed `w-72` cards to `grid grid-cols-1 md:grid-cols-2` — no horizontal scrollbar, cards fill available width.
  - `src/components/audit/audit-dashboard.tsx` — result cards for historical audits (`existingAudit` truthy) now show `<NoDataCard label="…" />` instead of nothing when a result is missing, keeping the 2×2 grid symmetrical. Added `NoDataCard` component.

- **Fixed: scroll snapping / jitter in chat and logs panels**
  - `src/components/chat/chat-panel.tsx` — replaced `scrollIntoView()` (scrolls all ancestor elements including the page window, causing a black void below layout) with direct `el.scrollTop = el.scrollHeight` on the messages container. This scopes scroll to the chat panel only. Also uses sticky-bottom pattern: `isAtBottomRef` tracks proximity (<80px from bottom), only auto-scrolls when user is already at bottom.
  - `src/components/audit/live-browser.tsx` — same sticky-bottom fix for logs panel (`isLogsAtBottomRef`, `logsContainerRef`). Switching to the Logs tab resets to bottom + re-enables auto-follow. `behavior: "instant"` prevents animation fighting.
- **Fixed: clicking a completed run now shows stored results instead of starting a new audit**
  - `app/audit/[id]/page.tsx` — now queries DB for the audit by ID on load; if `status === "completed"` and `results` JSON exists, passes `existingAudit` prop to `AuditDashboard` (no stream started). Falls back to live streaming for new/running audits.
  - `src/stores/audit-store.ts` — added `loadExistingAudit(auditId, domain, results)` action that hydrates the store from stored DB results and sets status to "completed" with all agents marked "done".
  - `src/components/audit/audit-dashboard.tsx` — accepts optional `existingAudit` prop; if present, calls `loadExistingAudit` instead of starting an SSE stream. Browser panel is shown for all audits (labeled "Browser Recording" for historical ones). Result card skeletons suppressed for historical audits.
  - `src/components/audit/live-browser.tsx` — accepts `sessionEnded` prop; shows contextual empty-state messages ("Snapshots not stored for completed sessions", "Logs not stored for completed sessions") instead of generic loading states.

- **Chat RAG system**: Full retrieval-augmented generation over audit results.
  - `src/lib/embeddings.ts` — `buildChunks()` (12+ chunk types), `embedAndStore()` (batch via `embedMany`+`withRetry`), `searchChunks()` (cosine similarity, top-k)
  - `src/lib/db.ts` — `chunk_embeddings` SQLite table; `storeChunkEmbeddings`, `hasChunkEmbeddings`, `getChunkEmbeddings`, `getPageByUrl` helpers
  - `app/api/embed/route.ts` — POST endpoint: builds+embeds chunks, idempotent (deletes then inserts)
  - `app/api/embed/status/route.ts` — GET endpoint: `{ ready: boolean }`
  - `app/api/chat/route.ts` — rewritten with RAG: embeds query → top-8 chunks → streamText with compact overview + `getPageDetails` tool
  - `src/agents/supervisor.ts` — fires POST `/api/embed` after DB save (fire-and-forget, non-fatal); uses `APP_URL` env var
  - `src/components/chat/chat-panel.tsx` — `useEmbedStatus` hook with auto-trigger for historical audits; ReactMarkdown for assistant messages; quick actions use `append()` to submit immediately
- **Sitemap index: 10 URLs per sub-sitemap**: `checkSitemap` now fetches ALL sub-sitemaps in a sitemap index, takes 10 page URLs from each (deduped), returning a merged list for diverse coverage. For plain sitemaps returns 10 URLs directly.
- **Content agent — structured outputs + vision**: `content.ts` now uses `generateObject` with a Zod schema (`ContentResultSchema`) — enforces complete, non-null E-E-A-T scores and all fields every run. No more JSON parsing/repair needed.
- **Screenshot-based E-E-A-T analysis**: Content agent now uses Claude vision API. `captureAndStore` in `crawler.ts` takes a JPEG viewport screenshot (quality 50) and stores it as base64 in `crawled_pages.screenshot`. `content.ts` passes up to 6 screenshots as image parts in the `messages` array using `Buffer.from(screenshot, "base64")` + `mimeType: "image/jpeg"`. Falls back to text-only analysis if no screenshots available.
  - `src/lib/db.ts` — `ALTER TABLE` adds `screenshot TEXT` column (idempotent); `getPagesByAuditId` returns `screenshot?: string`
  - `src/agents/crawler.ts` — `captureAndStore` now stores base64 screenshot alongside HTML
  - `src/agents/content.ts` — vision API path when screenshots present, text fallback otherwise
- **GEO multi-engine: added Gemini**: `searchGemini` tool navigates to gemini.google.com, types query in `rich-textarea`/contenteditable input, waits 9s for response, extracts text. Handles auth wall gracefully (marks as not_found). `geo.ts` updated to run 3 Perplexity + 2 Google + 2 Gemini searches (7 total, maxSteps 30). `geo-card.tsx` ENGINES updated to show Gemini instead of ChatGPT. `types.ts` adds `"gemini"` to engine union type.
- **Fixed JSON-LD regex in `html-parser.ts`**: `extractJsonLd` now handles unquoted `type` attribute (`type=application/ld+json` without quotes) — regex updated to `type=["']?application\/ld\+json["']?`
- **E2E test on printerpix.co.uk** confirmed: sitemap index detection working (9 URLs from sub-sitemap), GEO arc NaN fixed, E-E-A-T content visible
- **Fixed GEO arc NaN**: `geo-card.tsx` — `score` and CITE dimension values now guarded with `Number.isFinite()` before being passed to SVG path calculations; prevents "Expected number, NaN" console error
- **Fixed E-E-A-T content scores**: `html-parser.ts` `extractContentSummary` now includes `textSnippet` (1200 chars of visible body text) + `hasAuthorSignal`, `hasContactInfo`, `hasPrivacyLink`, `hasDateSignal` boolean signals so the LLM has actual page content to assess E-E-A-T quality
- **Fixed sitemap 0 URLs**: `playwright.ts` `checkSitemap` — replaced `page.evaluate(fetch(...))` (blocked by CORS/CSP on many sites) with `page.context().request.get()` (Playwright's HTTP client, bypasses browser restrictions); added sitemap index detection — if all `<loc>` tags point to `.xml` files, automatically fetches the first sub-sitemap to get actual page URLs
- **Fixed ScoreOverview NaN**: `score-overview.tsx` normalises `overallRaw` with `Number.isFinite()` before SVG ring gauge computation
- **Architectural overhaul — SQLite HTML storage**: Crawler now uses `captureAndStore` tool to save raw HTML to `crawled_pages` SQLite table. Content, schema, and technical agents query that table directly via `getPagesByAuditId()` and parse HTML server-side with `src/lib/html-parser.ts` before passing only compact extracted data to the LLM. This eliminates context overflow fundamentally.
  - `src/lib/schema.ts` — added `crawledPages` Drizzle table
  - `src/lib/db.ts` — exports `sqlite`, creates table on startup, adds `storePageHtml`/`getPagesByAuditId`
  - `src/lib/html-parser.ts` — new: regex-based server-side extraction (title, meta, headings, JSON-LD, word count, links)
  - `src/lib/types.ts` — `CrawlerResult` simplified: `pages: CrawledPage[]` → `pageUrls: string[]`; `CrawledPage` interface removed
  - `src/agents/crawler.ts` — added `auditId` param; `captureAndStore` inline tool replaces `extractPageData`
  - `src/agents/content.ts` — queries DB, no `CrawlerResult` pages; no Playwright
  - `src/agents/schema.ts` — queries DB, extracts JSON-LD from HTML; Playwright removed entirely
  - `src/agents/technical.ts` — queries DB for structural data; Playwright kept for live CWV (maxSteps: 6 → homepage only)
  - `src/agents/supervisor.ts` — passes `auditId` to agents; removed `schemaPage` browser allocation
  - `src/lib/trim-input.ts` — removed `trimForContent/Schema/Technical`; kept only `trimForStrategist` (updated for simplified CrawlerResult)
- Fixed context limit (round 1+2): trim-input.ts, PAGE_DATA_SCRIPT caps, extractSchemaMarkup cap (superseded by new architecture)
- Added `src/lib/retry.ts` — exponential-backoff retry (3 attempts, 2s/4s/8s) on 429/529/503/overload errors; wraps all `generateText` calls
- Fixed all agents: `src/lib/parse-agent-result.ts` with `jsonrepair` fallback for truncated JSON; `maxTokens: 16000` on all calls
- Fixed GEO agent: domain was missing from prompt (bug); limited to 3 Perplexity searches with explicit termination instruction
- Fixed React duplicate key: filmstrip now uses `absIdx`, logs use `timestamp-i` composite key — searches `result.steps[]` in reverse for JSON when `result.text` is empty (happens when `maxSteps` is exhausted mid-tool-call)
- Fixed LLM omits-empty-arrays: added `?? []` / `?? {}` guards in all four result cards (`SchemaCard`, `TechnicalCard`, `ContentCard`, `GEOCard`) — LLM may return `undefined` instead of `[]` for empty array fields; `TechnicalCard` also wraps CWV section in `{result.cwv && ...}` guard and guards `issue.affectedPages ?? []`
- Increased crawler `maxSteps` 30→50, technical/schema/geo 20→30
- Fixed crawler looping: added explicit no-revisit and termination rules to prompt
- Fixed sitemap parsing: `checkSitemap` now uses `page.evaluate(fetch())` to get the raw HTTP response body — `page.content()` and `document.body.innerText` both return Chrome's XML viewer DOM (not raw XML), so `<loc>` tags were missing
- Fixed sitemap discovery: prompt now instructs agent to use `sitemapUrl` returned by `checkRobotsTxt` before guessing paths
- **Migrated from Stagehand+Browserbase to Browser-Use Cloud** (`browser-use-sdk`):
  - `browserbase.ts` now uses `BrowserUse` client + Playwright CDP attachment
  - Session `liveUrl` (embeddable iframe) and `cdpUrl` (Playwright) returned from `client.browsers.create()`
  - `browser_session` stream event now carries `{ sessionId, liveUrl }` (no longer `sessionUrl`/`debugUrl`)
  - Zustand store: `browserLiveUrl` replaces `browserSessionUrl`/`browserDebugUrl`
  - `LiveBrowser` component: `liveUrl` prop replaces `sessionUrl`/`debugUrl` props
- Added live browser iframe embed using `liveUrl` from Browser-Use Cloud
- Added Logs tab and Popups tab to `LiveBrowser` component
- Added screenshot streaming with filmstrip UI
- Added resilient navigation with ERR_ABORTED retry
- Code quality: stable React keys for logs/popupReports, correct initial tab state, explicit types, lazy-loaded filmstrip thumbnails
