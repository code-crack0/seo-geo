// src/agents/graph/nodes.ts
// LangGraph node wrappers for each existing agent function.
// Each node reads from AuditGraphStateType, calls the agent, and returns a
// partial state update. Non-serialisable values (dataStream) are passed via
// config.configurable, NOT stored in graph state.

import type { RunnableConfig } from "@langchain/core/runnables";
import type { DataStreamWriter, JSONValue } from "ai";

import type { AuditGraphStateType } from "./state";

import { initBrowser, getMainPage, getNewBrowserPage } from "@/lib/browserbase";
import { updateAuditComplete, updateAuditFailed } from "@/lib/db";
import { runCrawlerAgent } from "../crawler";
import { runTechnicalAgent } from "../technical";
import { runContentAgent } from "../content";
import { runSchemaAgent } from "../schema";
import { runGEOAgent } from "../geo";
import { runStrategistAgent } from "../strategist";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pull the DataStreamWriter from graph config (non-serialisable, not in state). */
function getEmit(config: RunnableConfig) {
  const dataStream = config.configurable?.dataStream as DataStreamWriter;
  return (event: Record<string, unknown>) => {
    try {
      dataStream.writeData(event as JSONValue);
    } catch {
      // stream already closed — ignore
    }
  };
}

function getLog(config: RunnableConfig, auditId: string) {
  const emit = getEmit(config);
  return (level: "info" | "warn" | "error", message: string) => {
    const ts = new Date().toISOString();
    if (level === "error") console.error(`[${ts}] [${auditId}] ${message}`);
    else if (level === "warn") console.warn(`[${ts}] [${auditId}] ${message}`);
    else console.log(`[${ts}] [${auditId}] ${message}`);
    emit({ type: "log", level, message });
  };
}

// ── Node type alias ───────────────────────────────────────────────────────────

type Node = (
  state: AuditGraphStateType,
  config: RunnableConfig,
) => Promise<Partial<AuditGraphStateType>>;

// ── 1. initBrowserNode ────────────────────────────────────────────────────────

export const initBrowserNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);

  log("info", "Initialising browser session…");
  const { sessionId, liveUrl } = await initBrowser(state.auditId);

  emit({ type: "browser_session", sessionId, liveUrl });
  log("info", `Browser session ready: ${sessionId}`);

  return { sessionId, liveUrl };
};

// ── 2. crawlNode ──────────────────────────────────────────────────────────────

export const crawlNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);
  const dataStream = config.configurable?.dataStream as DataStreamWriter;

  emit({ type: "agent_status", agent: "crawler", status: "running" });
  log("info", "Crawler agent starting…");

  try {
    const page = getMainPage(state.auditId);
    const crawlerResult = await runCrawlerAgent(
      state.domain,
      state.auditId,
      dataStream,
      page,
    );

    emit({ type: "agent_status", agent: "crawler", status: "done" });
    emit({ type: "business_type", businessType: crawlerResult.businessType });
    log("info", `Crawler done — ${crawlerResult.pageUrls.length} pages found`);

    return { crawler: crawlerResult, status: "analyzing" };
  } catch (err) {
    log("error", `Crawler failed: ${String(err)}`);
    emit({ type: "agent_status", agent: "crawler", status: "error" });

    return {
      crawler: {
        pageUrls: [],
        businessType: "general",
        sitemapFound: false,
        robotsTxtFound: false,
        totalPages: 0,
        brokenLinks: [],
        redirectChains: [],
      },
      agentErrors: [{ agent: "crawler", error: String(err) }],
      status: "analyzing",
    };
  }
};

// ── 3. technicalNode ──────────────────────────────────────────────────────────

export const technicalNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);
  const dataStream = config.configurable?.dataStream as DataStreamWriter;

  emit({ type: "agent_status", agent: "technical", status: "running" });
  log("info", "Technical agent starting…");

  if (!state.crawler) {
    emit({ type: "agent_status", agent: "technical", status: "error", message: "Crawler result unavailable" });
    return { agentErrors: [{ agent: "technical", error: "Crawler result unavailable" }] };
  }

  let page;
  try {
    page = await getNewBrowserPage(state.auditId);
    const result = await runTechnicalAgent(
      state.crawler,
      state.auditId,
      dataStream,
      page,
    );

    emit({ type: "score_update", category: "technical", score: result.score });
    emit({ type: "partial_result", agent: "technical", data: result });
    emit({ type: "agent_status", agent: "technical", status: "done" });
    log("info", `Technical agent done — score: ${result.score}`);

    return { technical: result };
  } catch (err) {
    log("error", `Technical agent failed: ${String(err)}`);
    emit({ type: "agent_status", agent: "technical", status: "error" });
    return { agentErrors: [{ agent: "technical", error: String(err) }] };
  } finally {
    await page?.close().catch(() => {});
  }
};

// ── 4. contentNode ────────────────────────────────────────────────────────────

export const contentNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);

  emit({ type: "agent_status", agent: "content", status: "running" });
  log("info", "Content agent starting…");

  try {
    const result = await runContentAgent(
      state.auditId,
      state.crawler?.businessType ?? "general",
    );

    emit({ type: "score_update", category: "content", score: result.score });
    emit({ type: "partial_result", agent: "content", data: result });
    emit({ type: "agent_status", agent: "content", status: "done" });
    log("info", `Content agent done — score: ${result.score}`);

    return { content: result };
  } catch (err) {
    log("error", `Content agent failed: ${String(err)}`);
    emit({ type: "agent_status", agent: "content", status: "error" });
    return { agentErrors: [{ agent: "content", error: String(err) }] };
  }
};

// ── 5. schemaNode ─────────────────────────────────────────────────────────────

export const schemaNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);

  emit({ type: "agent_status", agent: "schema", status: "running" });
  log("info", "Schema agent starting…");

  try {
    const result = await runSchemaAgent(
      state.auditId,
      state.crawler?.businessType ?? "general",
    );

    emit({ type: "score_update", category: "schema", score: result.score });
    emit({ type: "partial_result", agent: "schema", data: result });
    emit({ type: "agent_status", agent: "schema", status: "done" });
    log("info", `Schema agent done — score: ${result.score}`);

    return { schema: result };
  } catch (err) {
    log("error", `Schema agent failed: ${String(err)}`);
    emit({ type: "agent_status", agent: "schema", status: "error" });
    return { agentErrors: [{ agent: "schema", error: String(err) }] };
  }
};

// ── 6. geoNode ────────────────────────────────────────────────────────────────

export const geoNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);
  const dataStream = config.configurable?.dataStream as DataStreamWriter;

  emit({ type: "agent_status", agent: "geo", status: "running" });
  log("info", "GEO agent starting…");

  let page;
  try {
    page = await getNewBrowserPage(state.auditId);
    const result = await runGEOAgent(
      state.domain,
      state.crawler?.businessType ?? "general",
      dataStream,
      page,
    );

    emit({ type: "score_update", category: "geo", score: result.aiVisibilityScore });
    emit({ type: "partial_result", agent: "geo", data: result });
    emit({ type: "agent_status", agent: "geo", status: "done" });
    log("info", `GEO agent done — score: ${result.aiVisibilityScore}`);

    return { geo: result };
  } catch (err) {
    log("error", `GEO agent failed: ${String(err)}`);
    emit({ type: "agent_status", agent: "geo", status: "error" });
    return { agentErrors: [{ agent: "geo", error: String(err) }] };
  } finally {
    await page?.close().catch(() => {});
  }
};

// ── 7. synthesizeNode ─────────────────────────────────────────────────────────

export const synthesizeNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);

  emit({ type: "agent_status", agent: "strategist", status: "running" });
  log("info", "Strategist agent starting…");

  try {
    const strategy = await runStrategistAgent({
      crawler: state.crawler!,
      technical: state.technical,
      content: state.content,
      schema: state.schema,
      geo: state.geo,
      businessType: state.crawler?.businessType ?? "general",
    });

    emit({ type: "score_update", category: "overall", score: strategy.overallScore });
    emit({ type: "agent_status", agent: "strategist", status: "done" });
    log("info", `Strategist done — overall score: ${strategy.overallScore}`);

    return { strategy, status: "completed" };
  } catch (err) {
    log("error", `Strategist agent failed: ${String(err)}`);
    emit({ type: "agent_status", agent: "strategist", status: "error", message: String(err) });
    return { agentErrors: [{ agent: "strategist", error: String(err) }] };
  }
};

// ── 8. saveNode ───────────────────────────────────────────────────────────────

export const saveNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);

  log("info", "Saving audit results to database…");

  await updateAuditComplete(state.auditId, {
    overallScore: state.strategy?.overallScore ?? null,
    technicalScore: state.technical?.score ?? null,
    contentScore: state.content?.score ?? null,
    schemaScore: state.schema?.score ?? null,
    geoScore: state.geo?.aiVisibilityScore ?? null,
    businessType: state.crawler?.businessType ?? null,
    results: {
      crawler: state.crawler,
      technical: state.technical,
      content: state.content,
      schema: state.schema,
      geo: state.geo,
      strategy: state.strategy,
    },
  });

  // Fire-and-forget embed trigger — non-fatal if it fails
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  fetch(`${appUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auditId: state.auditId }),
  }).catch(() => {});

  emit({ type: "audit_complete", state });
  log("info", "Audit saved and embed triggered");

  return { status: "completed" };
};

// ── 9. handleErrorNode ────────────────────────────────────────────────────────

export const handleErrorNode: Node = async (state, config) => {
  const emit = getEmit(config);
  const log = getLog(config, state.auditId);

  log("error", "Audit pipeline encountered a fatal error");
  const errorSummary = state.agentErrors?.map(e => `${e.agent}: ${e.error}`).join("; ") ?? "Unknown error";
  emit({ type: "agent_status", agent: "pipeline", status: "error", message: errorSummary });

  try {
    await updateAuditFailed(state.auditId);
  } catch {
    // DB update is best-effort
  }

  return { status: "failed" };
};
