// src/agents/supervisor.ts
import type { DataStreamWriter, JSONValue } from "ai";
import { runCrawlerAgent } from "./crawler";
import { runTechnicalAgent } from "./technical";
import { runContentAgent } from "./content";
import { runSchemaAgent } from "./schema";
import { runGEOAgent } from "./geo";
import { runStrategistAgent } from "./strategist";
import { updateAuditComplete, updateAuditFailed } from "@/lib/db";
import type { AuditState } from "@/lib/types";
import { initBrowser, getMainPage, getNewBrowserPage, closeBrowser } from "@/lib/browserbase";

export async function runSupervisor(domain: string, auditId: string, dataStream: DataStreamWriter): Promise<void> {
  const state: Partial<AuditState> = { auditId, domain, status: "crawling" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emit = (event: Record<string, any>) => dataStream.writeData(event as JSONValue);
  const log = (level: "info" | "warn" | "error", message: string) => {
    // Console output captured by Railway logs
    const ts = new Date().toISOString();
    if (level === "error") console.error(`[${ts}] [${auditId}] ${message}`);
    else if (level === "warn") console.warn(`[${ts}] [${auditId}] ${message}`);
    else console.log(`[${ts}] [${auditId}] ${message}`);
    try { emit({ type: "log", level, message }); } catch { /* stream closed */ }
  };

  try {
    // ── Initialize Browser-Use Cloud session ─────────────────────────────────
    log("info", "[supervisor] Initializing Browser-Use cloud session...");
    const session = await initBrowser();
    emit({ type: "browser_session", sessionId: session.sessionId, liveUrl: session.liveUrl });
    log("info", `[supervisor] Session ready → ${session.liveUrl}`);

    // ── Step 1: Crawl ─────────────────────────────────────────────────────────
    emit({ type: "agent_status", agent: "crawler", status: "running", message: "Starting site crawl..." });
    log("info", `[crawler] Beginning crawl of ${domain}`);

    const crawlerPage = getMainPage();
    let crawlerResult: Awaited<ReturnType<typeof runCrawlerAgent>>;
    try {
      crawlerResult = await runCrawlerAgent(domain, auditId, dataStream, crawlerPage);
      emit({ type: "agent_status", agent: "crawler", status: "done", message: `${crawlerResult.pageUrls.length} pages crawled` });
      log("info", `[crawler] Done — ${crawlerResult.pageUrls.length} pages, type: ${crawlerResult.businessType}`);
    } catch (crawlerErr) {
      log("warn", `[crawler] Failed — continuing with partial data: ${String(crawlerErr)}`);
      emit({ type: "agent_status", agent: "crawler", status: "error", message: `Crawl partial — continuing analysis` });
      crawlerResult = { pageUrls: [], businessType: "general", sitemapFound: false, robotsTxtFound: false, totalPages: 0, brokenLinks: [], redirectChains: [] };
    }
    emit({ type: "business_type", businessType: crawlerResult.businessType });
    state.crawler = crawlerResult;
    state.businessType = crawlerResult.businessType;

    // ── Step 2: Parallel analysis ─────────────────────────────────────────────
    state.status = "analyzing";
    emit({ type: "agent_status", agent: "technical", status: "running", message: "Auditing 8 technical categories..." });
    emit({ type: "agent_status", agent: "content", status: "running", message: "Analyzing E-E-A-T signals..." });
    emit({ type: "agent_status", agent: "schema", status: "running", message: "Validating structured data..." });
    emit({ type: "agent_status", agent: "geo", status: "running", message: "Checking AI engine visibility..." });

    // Technical agent needs a browser page for live CWV measurement; others query SQLite
    const [technicalPage, geoPage] = await Promise.all([
      getNewBrowserPage(),
      getNewBrowserPage(),
    ]);

    const [technical, content, schema, geo] = await Promise.allSettled([
      runTechnicalAgent(crawlerResult, auditId, dataStream, technicalPage),
      runContentAgent(auditId, crawlerResult.businessType),
      runSchemaAgent(auditId, crawlerResult.businessType),
      runGEOAgent(domain, crawlerResult.businessType, dataStream, geoPage),
    ]);

    await Promise.all([
      technicalPage.close().catch(() => {}),
      geoPage.close().catch(() => {}),
    ]);

    if (technical.status === "fulfilled") {
      state.technical = technical.value;
      emit({ type: "agent_status", agent: "technical", status: "done", message: `Score: ${technical.value.score}` });
      emit({ type: "partial_result", agent: "technical", data: technical.value });
      emit({ type: "score_update", category: "technical", score: technical.value.score });
      log("info", `[technical] Score: ${technical.value.score} — ${technical.value.issues?.length ?? 0} issues found`);
    } else {
      emit({ type: "agent_status", agent: "technical", status: "error", message: String(technical.reason) });
      log("error", `[technical] Failed: ${String(technical.reason)}`);
    }

    if (content.status === "fulfilled") {
      state.content = content.value;
      emit({ type: "agent_status", agent: "content", status: "done", message: `Score: ${content.value.score}` });
      emit({ type: "partial_result", agent: "content", data: content.value });
      emit({ type: "score_update", category: "content", score: content.value.score });
      log("info", `[content] Score: ${content.value.score}`);
    } else {
      emit({ type: "agent_status", agent: "content", status: "error", message: String(content.reason) });
      log("error", `[content] Failed: ${String(content.reason)}`);
    }

    if (schema.status === "fulfilled") {
      state.schema = schema.value;
      emit({ type: "agent_status", agent: "schema", status: "done", message: `Score: ${schema.value.score}` });
      emit({ type: "partial_result", agent: "schema", data: schema.value });
      emit({ type: "score_update", category: "schema", score: schema.value.score });
      log("info", `[schema] Score: ${schema.value.score} — ${schema.value.detected?.length ?? 0} schemas found`);
    } else {
      emit({ type: "agent_status", agent: "schema", status: "error", message: String(schema.reason) });
      log("error", `[schema] Failed: ${String(schema.reason)}`);
    }

    if (geo.status === "fulfilled") {
      state.geo = geo.value;
      emit({ type: "agent_status", agent: "geo", status: "done", message: `AI Visibility: ${geo.value.aiVisibilityScore}` });
      emit({ type: "partial_result", agent: "geo", data: geo.value });
      emit({ type: "score_update", category: "geo", score: geo.value.aiVisibilityScore });
      log("info", `[geo] AI Visibility: ${geo.value.aiVisibilityScore}`);
    } else {
      emit({ type: "agent_status", agent: "geo", status: "error", message: String(geo.reason) });
      log("error", `[geo] Failed: ${String(geo.reason)}`);
    }

    // ── Step 3: Synthesize ────────────────────────────────────────────────────
    state.status = "synthesizing";
    emit({ type: "agent_status", agent: "strategist", status: "running", message: "Synthesizing report..." });
    log("info", "[strategist] Generating priority action plan...");

    const strategy = await runStrategistAgent({
      crawler: state.crawler!,
      technical: state.technical,
      content: state.content,
      schema: state.schema,
      geo: state.geo,
      businessType: state.businessType!,
    });

    state.strategy = strategy;
    state.status = "completed";
    emit({ type: "agent_status", agent: "strategist", status: "done", message: `Overall score: ${strategy.overallScore}` });
    emit({ type: "partial_result", agent: "strategist", data: strategy });
    emit({ type: "score_update", category: "overall", score: strategy.overallScore });
    log("info", `[supervisor] Audit complete. Overall score: ${strategy.overallScore}`);

    // Save to DB first — must happen before audit_complete so client embed trigger finds the data
    await updateAuditComplete(auditId, {
      overallScore: strategy.overallScore ?? null,
      technicalScore: state.technical?.score ?? null,
      contentScore: state.content?.score ?? null,
      schemaScore: state.schema?.score ?? null,
      geoScore: state.geo?.aiVisibilityScore ?? null,
      results: state,
      businessType: state.businessType ?? null,
    });

    // Kick off embedding before notifying client so polling can find it sooner (fire-and-forget)
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    fetch(`${appUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditId }),
    }).catch((err) => log("warn", `[supervisor] Embedding failed (non-fatal): ${String(err)}`));

    // Notify client last — by now DB is saved and embedding is underway
    emit({ type: "audit_complete", state: state as AuditState });

  } catch (error) {
    try { emit({ type: "agent_status", agent: "supervisor", status: "error", message: String(error) }); } catch { /* stream closed */ }
    try { emit({ type: "log", level: "error", message: `[supervisor] Fatal error: ${String(error)}` }); } catch { /* stream closed */ }
    try { await updateAuditFailed(auditId); } catch { /* ignore */ }
  } finally {
    await closeBrowser();
    try { log("info", "[supervisor] Browser-Use session closed."); } catch { /* */ }
  }
}
