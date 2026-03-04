// src/lib/db.ts — Supabase-backed database helpers (replaces better-sqlite3 + Drizzle)
import { supabase } from "./supabase";

// ── Audits ────────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: string;
  domain: string;
  business_type: string | null;
  status: string;
  overall_score: number | null;
  technical_score: number | null;
  content_score: number | null;
  schema_score: number | null;
  geo_score: number | null;
  results: unknown | null;
  created_at: string;
  completed_at: string | null;
}

export async function createAudit(id: string, domain: string): Promise<void> {
  const { error } = await supabase.from("audits").insert({
    id,
    domain,
    status: "crawling",
  });
  if (error) throw new Error(`createAudit: ${error.message}`);
}

export async function updateAuditComplete(
  id: string,
  data: {
    overallScore: number | null;
    technicalScore: number | null;
    contentScore: number | null;
    schemaScore: number | null;
    geoScore: number | null;
    results: unknown;
    businessType: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("audits").update({
    status: "completed",
    overall_score: data.overallScore,
    technical_score: data.technicalScore,
    content_score: data.contentScore,
    schema_score: data.schemaScore,
    geo_score: data.geoScore,
    results: data.results,
    business_type: data.businessType,
    completed_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(`updateAuditComplete: ${error.message}`);
}

export async function updateAuditFailed(id: string): Promise<void> {
  await supabase.from("audits").update({ status: "failed" }).eq("id", id);
}

export async function getAuditById(id: string): Promise<AuditRow | null> {
  const { data, error } = await supabase.from("audits").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data as AuditRow;
}

export async function getRecentAudits(limit = 10): Promise<AuditRow[]> {
  const { data } = await supabase
    .from("audits")
    .select("id, domain, status, overall_score, business_type, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AuditRow[];
}

// ── Crawled pages ─────────────────────────────────────────────────────────────

export async function storePageHtml(
  auditId: string,
  url: string,
  html: string,
  screenshot?: string | null
): Promise<void> {
  const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;
  const { error } = await supabase.from("crawled_pages").upsert(
    {
      audit_id: auditId,
      url,
      html: capped,
      screenshot: screenshot ?? null,
      crawled_at: Date.now(),
    },
    { onConflict: "audit_id,url" }
  );
  if (error) throw new Error(`storePageHtml: ${error.message}`);
}

export async function getPagesByAuditId(
  auditId: string
): Promise<{ url: string; html: string; screenshot?: string | null }[]> {
  const { data } = await supabase
    .from("crawled_pages")
    .select("url, html, screenshot")
    .eq("audit_id", auditId)
    .order("id", { ascending: true });
  return (data ?? []) as { url: string; html: string; screenshot?: string | null }[];
}

export async function getPageByUrl(
  auditId: string,
  url: string
): Promise<{ url: string; html: string; screenshot?: string | null } | null> {
  const { data } = await supabase
    .from("crawled_pages")
    .select("url, html, screenshot")
    .eq("audit_id", auditId)
    .eq("url", url)
    .single();
  return data ?? null;
}

// ── Chunk embeddings ──────────────────────────────────────────────────────────

export interface StoredChunk {
  id: number;
  audit_id: string;
  chunk_type: string;
  content: string;
  metadata: string;     // JSON string
  embedding: number[];  // float array from Supabase real[]
}

export async function storeChunkEmbeddings(
  auditId: string,
  chunks: { chunkType: string; content: string; metadata: Record<string, unknown>; embedding: number[] }[]
): Promise<void> {
  // Delete existing chunks for this audit (idempotent re-run)
  await supabase.from("chunk_embeddings").delete().eq("audit_id", auditId);

  const rows = chunks.map((c) => ({
    audit_id: auditId,
    chunk_type: c.chunkType,
    content: c.content,
    metadata: c.metadata,
    embedding: c.embedding,
  }));

  // Insert in batches of 50 to avoid request size limits
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("chunk_embeddings").insert(batch);
    if (error) throw new Error(`storeChunkEmbeddings: ${error.message}`);
  }
}

export async function hasChunkEmbeddings(auditId: string): Promise<boolean> {
  const { count } = await supabase
    .from("chunk_embeddings")
    .select("*", { count: "exact", head: true })
    .eq("audit_id", auditId);
  return (count ?? 0) > 0;
}

export async function getChunkEmbeddings(auditId: string): Promise<StoredChunk[]> {
  const { data } = await supabase
    .from("chunk_embeddings")
    .select("id, audit_id, chunk_type, content, metadata, embedding")
    .eq("audit_id", auditId);
  return (data ?? []).map((row) => ({
    ...row,
    metadata: typeof row.metadata === "string" ? row.metadata : JSON.stringify(row.metadata),
  })) as StoredChunk[];
}
