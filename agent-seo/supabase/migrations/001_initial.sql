-- AgentSEO — Initial Supabase schema
-- Run this in the Supabase SQL editor to create all required tables.

-- ── audits ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audits (
  id             TEXT PRIMARY KEY,
  domain         TEXT NOT NULL,
  business_type  TEXT,
  status         TEXT NOT NULL DEFAULT 'running',
  overall_score  REAL,
  technical_score REAL,
  content_score  REAL,
  schema_score   REAL,
  geo_score      REAL,
  results        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audits_created ON audits (created_at DESC);

-- ── crawled_pages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crawled_pages (
  id          BIGSERIAL PRIMARY KEY,
  audit_id    TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  html        TEXT,
  screenshot  TEXT,           -- base64 JPEG, optional
  crawled_at  BIGINT,
  UNIQUE (audit_id, url)
);

CREATE INDEX IF NOT EXISTS idx_crawled_pages_audit ON crawled_pages (audit_id);

-- ── chunk_embeddings ──────────────────────────────────────────────────────────
-- Embeddings stored as real[] (1536-dim float arrays for text-embedding-3-small)
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  id          BIGSERIAL PRIMARY KEY,
  audit_id    TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  chunk_type  TEXT NOT NULL,
  content     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  embedding   REAL[] NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_audit ON chunk_embeddings (audit_id);
