/**
 * One-time migration runner: creates the scrape_runs table in Supabase.
 * Usage: node db/migrate.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('[Migrate] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function migrate() {
  console.log('[Migrate] Running migration 002: scrape_runs...');

  // Supabase JS does not expose raw DDL. Use rpc with a postgres function, or
  // test the table existence and report the required SQL.
  const { error } = await supabase.from('scrape_runs').select('id').limit(1);

  if (!error) {
    console.log('[Migrate] scrape_runs table already exists. Nothing to do.');
    return;
  }

  if (error.code === 'PGRST205') {
    console.log('\n[Migrate] scrape_runs table does NOT exist.');
    console.log('[Migrate] Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('------ PASTE THIS INTO SUPABASE SQL EDITOR ------');
    console.log(`
CREATE TABLE IF NOT EXISTS scrape_runs (
    id UUID PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'finished', 'failed')),
    summary JSONB,
    locked_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_started_at ON scrape_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_active_lock ON scrape_runs(status, locked_until) WHERE status = 'running';
`);
    console.log('--------------------------------------------------');
    process.exit(1);
  }

  console.error('[Migrate] Unexpected error checking table:', error.message);
  process.exit(1);
}

migrate();
