-- ==========================================
-- Migration 002: Create scrape_runs table for cron overlap protection
-- ==========================================

CREATE TABLE IF NOT EXISTS scrape_runs (
    id UUID PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'finished', 'failed')),
    summary JSONB,
    locked_until TIMESTAMPTZ NOT NULL
);

-- Index for querying recent runs efficiently
CREATE INDEX IF NOT EXISTS idx_scrape_runs_started_at ON scrape_runs(started_at DESC);

-- Index for overlap checking
CREATE INDEX IF NOT EXISTS idx_scrape_runs_active_lock ON scrape_runs(status, locked_until) WHERE status = 'running';
