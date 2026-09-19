import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { scrapeAll } from '../scraper/scrapeAll.js';
import { closeBrowser } from '../scraper/browser.js';

const router = Router();

// Track the current run ID in memory so SIGTERM can cleanly fail it
let activeRunId = null;

/**
 * Handle SIGTERM gracefully by marking the active run as failed
 * and closing the browser.
 */
process.on('SIGTERM', async () => {
  console.log('[System] SIGTERM received. Shutting down...');
  if (activeRunId) {
    console.log(`[Cron] Marking active run ${activeRunId} as failed due to instance shutdown.`);
    try {
      await supabase.from('scrape_runs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        summary: { error: 'instance_shutdown' }
      }).eq('id', activeRunId);
    } catch (err) {
      console.error('[Cron] Failed to update active run on SIGTERM:', err.message);
    }
    activeRunId = null;
  }
  await closeBrowser();
  process.exit(0);
});

/**
 * POST /api/cron/scrape
 * External trigger for scheduled scraping (protected by CRON_SECRET).
 */
router.post('/scrape', async (req, res, next) => {
  try {
    const providedSecret = req.headers['x-cron-secret'];
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      console.error('[Cron Error] CRON_SECRET is not configured in the environment.');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    if (!providedSecret || typeof providedSecret !== 'string') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Constant-time comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Database connection unconfigured' });
    }

    // 1. Overlap Protection: Check for active lock
    const { data: activeLock, error: lockErr } = await supabase
      .from('scrape_runs')
      .select('id, locked_until')
      .eq('status', 'running')
      .gt('locked_until', new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (lockErr) {
      console.error('[Cron DB Error] Checking lock failed:', lockErr.message);
      return res.status(500).json({ error: 'Failed to acquire lock' });
    }

    if (activeLock) {
      console.warn(`[Cron] Rejecting scrape trigger: run_in_progress (Lock: ${activeLock.id})`);
      return res.status(409).json({ error: 'run_in_progress' });
    }

    // 2. Acquire lock by creating a new run
    const runId = crypto.randomUUID();
    const lockDurationMs = 15 * 60 * 1000; // 15 minutes max lock
    const lockedUntil = new Date(Date.now() + lockDurationMs).toISOString();

    const { error: insertErr } = await supabase.from('scrape_runs').insert({
      id: runId,
      status: 'running',
      locked_until: lockedUntil
    });

    if (insertErr) {
      console.error('[Cron DB Error] Failed to insert run lock:', insertErr.message);
      return res.status(500).json({ error: 'Failed to start run' });
    }

    activeRunId = runId;

    // 3. Return 202 immediately unless wait=true is passed (for manual testing)
    const isWait = req.query.wait === 'true';
    if (!isWait) {
      res.status(202).json({ message: 'Scrape started in background', runId });
    }

    // 4. Background execution
    const backgroundTask = async () => {
      let finalStatus = 'finished';
      let runSummary = {};

      try {
        console.log(`[Cron] Background scrape started (Run ID: ${runId})`);
        runSummary = await scrapeAll({ run_id: runId });
      } catch (err) {
        console.error(`[Cron Background Error] Run ${runId} failed ungracefully:`, err.stack || err);
        finalStatus = 'failed';
        runSummary = { error: err.message, stack: err.stack };
      } finally {
        try {
          await supabase.from('scrape_runs').update({
            status: finalStatus,
            finished_at: new Date().toISOString(),
            summary: runSummary
          }).eq('id', runId);
          console.log(`[Cron] Run ${runId} marked as ${finalStatus} in DB.`);
        } catch (dbErr) {
          console.error(`[Cron DB Error] Failed to update run ${runId} completion:`, dbErr.message);
        }
        
        if (activeRunId === runId) {
          activeRunId = null;
        }
      }
    };

    if (isWait) {
      await backgroundTask();
      // Fetch the updated row to return it
      const { data: finalRun } = await supabase.from('scrape_runs').select('*').eq('id', runId).single();
      return res.status(200).json({ message: 'Scrape completed', run: finalRun });
    } else {
      // Fire and forget
      backgroundTask().catch(err => console.error('[Cron Error] Uncaught background error:', err));
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs
 * List recent runs.
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const { data: runs, error } = await supabase
      .from('scrape_runs')
      .select('id, started_at, finished_at, status, summary')
      .order('started_at', { ascending: false })
      .limit(Math.min(limit, 50));

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch runs' });
    }

    res.json({ runs });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/runs/latest
 * Get the most recent run.
 */
router.get('/latest', async (req, res, next) => {
  try {
    const { data: run, error } = await supabase
      .from('scrape_runs')
      .select('id, started_at, finished_at, status, summary')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch latest run' });
    }

    res.json({ run: run || null });
  } catch (err) {
    next(err);
  }
});

export default router;
