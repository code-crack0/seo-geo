// src/lib/embeddings.ts
import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import type { AuditState } from "@/lib/types";
import { getPagesByAuditId, storeChunkEmbeddings, getChunkEmbeddings } from "@/lib/db";
import { withRetry } from "@/lib/retry";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawChunk {
  chunkType: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RetrievedChunk {
  chunkType: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

// ── Chunk builder ─────────────────────────────────────────────────────────────

/** Build all plaintext chunks from a completed AuditState + stored page data */
export async function buildChunks(auditId: string, state: AuditState): Promise<RawChunk[]> {
  const chunks: RawChunk[] = [];

  // Overview
  chunks.push({
    chunkType: "overview",
    content: [
      `Domain: ${state.domain}`,
      `Business type: ${state.businessType ?? "unknown"}`,
      `Overall score: ${state.strategy?.overallScore ?? "N/A"}`,
      `Technical: ${state.technical?.score ?? "N/A"}`,
      `Content: ${state.content?.score ?? "N/A"}`,
      `Schema: ${state.schema?.score ?? "N/A"}`,
      `GEO AI Visibility: ${state.geo?.aiVisibilityScore ?? "N/A"}`,
      `Quick wins: ${(state.strategy?.quickWins ?? []).slice(0, 3).join("; ")}`,
    ].join(" | "),
    metadata: { domain: state.domain },
  });

  // Technical — CWV
  if (state.technical?.cwv) {
    const { lcp, inp, cls } = state.technical.cwv;
    chunks.push({
      chunkType: "technical_cwv",
      content: `Core Web Vitals: LCP ${lcp.value}ms (${lcp.rating}), INP ${inp.value}ms (${inp.rating}), CLS ${cls.value} (${cls.rating}). Mobile: ${state.technical.mobileResponsive ? "responsive" : "not responsive"}. HTTPS: ${state.technical.httpsEnabled ? "yes" : "no"}.`,
      metadata: { score: state.technical.score },
    });
  }

  // Technical — issues
  const issues = state.technical?.issues ?? [];
  const critical = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");
  if (critical.length > 0) {
    chunks.push({
      chunkType: "technical_issues",
      content: `Critical technical issues (${critical.length}): ` + critical.map((i) => `[${i.category}] ${i.title} — ${i.recommendation}`).join(". "),
      metadata: { severity: "critical", count: critical.length },
    });
  }
  if (warnings.length > 0) {
    chunks.push({
      chunkType: "technical_issues",
      content: `Technical warnings (${warnings.length}): ` + warnings.slice(0, 8).map((i) => `[${i.category}] ${i.title}`).join(". "),
      metadata: { severity: "warning", count: warnings.length },
    });
  }
  if ((state.technical?.indexabilityIssues ?? []).length > 0) {
    chunks.push({
      chunkType: "technical_issues",
      content: `Indexability issues: ${state.technical?.indexabilityIssues.join("; ") ?? ""}`,
      metadata: { severity: "info" },
    });
  }

  // Content — E-E-A-T
  if (state.content?.eeat) {
    const { experience, expertise, authoritativeness, trustworthiness } = state.content.eeat;
    chunks.push({
      chunkType: "content_eeat",
      content: [
        `E-E-A-T scores (content score: ${state.content.score}):`,
        `Experience ${experience.score} — ${experience.signals.slice(0, 3).join(", ")}.`,
        `Expertise ${expertise.score} — ${expertise.signals.slice(0, 3).join(", ")}.`,
        `Authoritativeness ${authoritativeness.score} — ${authoritativeness.signals.slice(0, 3).join(", ")}.`,
        `Trustworthiness ${trustworthiness.score} — ${trustworthiness.signals.slice(0, 3).join(", ")}.`,
      ].join(" "),
      metadata: { score: state.content.score },
    });
  }

  // Content — thin pages
  const thinPages = state.content?.thinPages ?? [];
  if (thinPages.length > 0) {
    chunks.push({
      chunkType: "content_thin_pages",
      content: `Thin/low-quality pages (${thinPages.length}): ` + thinPages.slice(0, 10).map((p) => `${p.url} (${p.wordCount} words — ${p.issue})`).join(". "),
      metadata: { count: thinPages.length },
    });
  }

  // Content — recommendations
  const contentRecs = state.content?.recommendations ?? [];
  if (contentRecs.length > 0) {
    chunks.push({
      chunkType: "recommendations",
      content: `Content recommendations: ${contentRecs.join(". ")}`,
      metadata: { category: "content" },
    });
  }

  // Schema — detected
  const detected = state.schema?.detected ?? [];
  if (detected.length > 0) {
    chunks.push({
      chunkType: "schema_detected",
      content: `Schema markup detected (${detected.length} items, score ${state.schema?.score}): ` +
        detected.slice(0, 10).map((d) => `${d.type} on ${d.url} [${d.format}] — ${d.valid ? "valid" : `invalid: ${d.issues.slice(0, 2).join(", ")}`}`).join(". "),
      metadata: { score: state.schema?.score, count: detected.length },
    });
  }

  // Schema — missing
  const missing = state.schema?.missing ?? [];
  if (missing.length > 0) {
    chunks.push({
      chunkType: "schema_missing",
      content: `Missing schema opportunities: ` + missing.map((m) => `${m.type} (${m.priority} priority) — ${m.reason}`).join(". "),
      metadata: { count: missing.length },
    });
  }

  // GEO — mentions per engine
  const mentions = state.geo?.mentions ?? [];
  if (mentions.length > 0) {
    const byEngine: Record<string, typeof mentions> = {};
    for (const m of mentions) {
      (byEngine[m.engine] ??= []).push(m);
    }
    for (const [engine, ms] of Object.entries(byEngine)) {
      const cited = ms.filter((m) => m.mentioned).length;
      chunks.push({
        chunkType: "geo_mentions",
        content: `${engine}: ${cited}/${ms.length} queries mentioned the brand. ` +
          ms.map((m) => `"${m.query}" → ${m.mentioned ? `${m.sentiment}, ${m.position}` : "not mentioned"}`).join(". "),
        metadata: { engine, mentionRate: cited / ms.length },
      });
    }
  }

  // GEO — citation gaps
  const gaps = state.geo?.citationGaps ?? [];
  if (gaps.length > 0) {
    chunks.push({
      chunkType: "geo_citation_gaps",
      content: `Citation gaps (${gaps.length}): ` + gaps.map((g) => `"${g.topic}" — competitors cited: ${g.competitorsCited.join(", ")}. Fix: ${g.opportunity}`).join(". "),
      metadata: { count: gaps.length },
    });
  }

  // GEO — CITE scores
  if (state.geo?.citeScore) {
    const { clarity, intent, trust, evidence } = state.geo.citeScore;
    chunks.push({
      chunkType: "geo_cite_score",
      content: `CITE framework scores (AI visibility ${state.geo.aiVisibilityScore}): Clarity ${clarity}, Intent ${intent}, Trust ${trust}, Evidence ${evidence}. ${trust < 50 ? "Trust is low — add schema markup, author bios, and recent publish dates." : ""} ${evidence < 50 ? "Evidence is low — add statistics, case studies, and expert quotes." : ""}`.trim(),
      metadata: { aiVisibilityScore: state.geo.aiVisibilityScore },
    });
  }

  // GEO — recommendations
  const geoRecs = state.geo?.recommendations ?? [];
  if (geoRecs.length > 0) {
    chunks.push({
      chunkType: "recommendations",
      content: `GEO recommendations: ${geoRecs.join(". ")}`,
      metadata: { category: "geo" },
    });
  }

  // Strategy — prioritized actions
  const actions = state.strategy?.prioritizedActions ?? [];
  const highImpact = actions.filter((a) => a.impact === "high");
  if (highImpact.length > 0) {
    chunks.push({
      chunkType: "strategy_actions",
      content: `Top priority actions: ` + highImpact.slice(0, 6).map((a) => `[${a.category}] ${a.action} — ${a.details}`).join(". "),
      metadata: { count: highImpact.length },
    });
  }

  // Strategy — quick wins
  const quickWins = state.strategy?.quickWins ?? [];
  if (quickWins.length > 0) {
    chunks.push({
      chunkType: "strategy_quick_wins",
      content: `Quick wins: ${quickWins.join(". ")}`,
      metadata: {},
    });
  }

  // Page summaries (from Supabase crawled_pages)
  const pages = await getPagesByAuditId(auditId);
  for (const page of pages) {
    if (!page.html) continue;
    const titleMatch = page.html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    const descMatch = page.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,200})["']/i);
    const wordCount = (page.html.match(/\b\w+\b/g) ?? []).length;
    const hasScreenshot = Boolean(page.screenshot);
    chunks.push({
      chunkType: "page_summary",
      content: `Page: ${page.url} | Title: ${titleMatch?.[1]?.trim() ?? "no title"} | Meta: ${descMatch?.[1]?.trim() ?? "no description"} | ~${wordCount} words | Screenshot: ${hasScreenshot ? "yes" : "no"}`,
      metadata: { url: page.url, wordCount, hasScreenshot },
    });
  }

  return chunks;
}

// ── Embedding ─────────────────────────────────────────────────────────────────

const EMBED_MODEL = openai.embedding("text-embedding-3-small");
const BATCH_SIZE = 100;

/** Embed all chunks and store them in Supabase */
export async function embedAndStore(auditId: string, chunks: RawChunk[]): Promise<number> {
  const texts = chunks.map((c) => c.content);
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await withRetry(() => embedMany({ model: EMBED_MODEL, values: batch }));
    allEmbeddings.push(...embeddings);
  }

  const toStore = chunks.map((c, i) => ({
    chunkType: c.chunkType,
    content: c.content,
    metadata: c.metadata,
    embedding: allEmbeddings[i],
  }));

  await storeChunkEmbeddings(auditId, toStore);
  return toStore.length;
}

// ── Similarity search ─────────────────────────────────────────────────────────

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Embed a query and return the top-k most relevant chunks */
export async function searchChunks(auditId: string, query: string, topK = 8): Promise<RetrievedChunk[]> {
  const { embedding: queryVec } = await embed({ model: EMBED_MODEL, value: query });
  const queryArr = new Float32Array(queryVec);

  const stored = await getChunkEmbeddings(auditId);
  const scored = stored.map((row) => {
    // embedding is number[] from Supabase real[] column
    const embeddingArr = Array.isArray(row.embedding) ? row.embedding : [];
    const vec = new Float32Array(embeddingArr);
    return {
      chunkType: row.chunk_type,
      content: row.content,
      metadata: (() => {
        try { return JSON.parse(row.metadata) as Record<string, unknown>; } catch { return {}; }
      })(),
      score: cosineSimilarity(queryArr, vec),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
