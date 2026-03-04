-- Persisted audit stream events for reconnection support
CREATE TABLE IF NOT EXISTS audit_events (
  id         BIGSERIAL PRIMARY KEY,
  audit_id   TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  event      JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_audit ON audit_events (audit_id, id);
