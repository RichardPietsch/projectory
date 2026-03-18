-- Shared rate-limit buckets for multi-instance correctness.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  scope TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, actor_key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_updated_at
  ON rate_limit_buckets(updated_at);
