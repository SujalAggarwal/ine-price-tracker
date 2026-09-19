import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as supabaseConfig from '../src/config/supabase.js';
import * as scrapeAllModule from '../src/scraper/scrapeAll.js';

describe('Phase 4 - Cron & Deployment Tests', () => {
  let mockSupabase;
  const SECRET = 'test-secret';

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;

    // Reset module state
    vi.resetModules();
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(), // allow chaining .update().eq()
      single: vi.fn().mockResolvedValue({ data: { id: 'test-run' }, error: null })
    };

    vi.spyOn(supabaseConfig, 'supabase', 'get').mockReturnValue(mockSupabase);
    vi.spyOn(scrapeAllModule, 'scrapeAll').mockResolvedValue({ success: 1, failed: 0 });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('POST /api/cron/scrape', () => {
    it('returns 401 if X-Cron-Secret header is missing', async () => {
      const res = await request(app).post('/api/cron/scrape');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 if X-Cron-Secret header is incorrect', async () => {
      const res = await request(app)
        .post('/api/cron/scrape')
        .set('X-Cron-Secret', 'wrong-secret');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 202 Accepted with valid secret and runs background task', async () => {
      const res = await request(app)
        .post('/api/cron/scrape')
        .set('X-Cron-Secret', SECRET);

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Scrape started in background');
      expect(res.body.runId).toBeDefined();

      // Wait a tick for background task to invoke mock
      await new Promise(r => setTimeout(r, 10));
      expect(scrapeAllModule.scrapeAll).toHaveBeenCalledTimes(1);
    });

    it('returns 409 Conflict if a run is already locked (overlap protection)', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 'existing-run', locked_until: new Date(Date.now() + 10000).toISOString() },
        error: null
      });

      const res = await request(app)
        .post('/api/cron/scrape')
        .set('X-Cron-Secret', SECRET);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('run_in_progress');
    });

    it('ignores lock and proceeds if lock has expired', async () => {
      // maybeSingle returning null simulates no ACTIVE lock found
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await request(app)
        .post('/api/cron/scrape')
        .set('X-Cron-Secret', SECRET);

      expect(res.status).toBe(202);
      expect(mockSupabase.insert).toHaveBeenCalledTimes(1);
    });

    it('waits and returns 200 with summary if ?wait=true is passed', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await request(app)
        .post('/api/cron/scrape?wait=true')
        .set('X-Cron-Secret', SECRET);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Scrape completed');
      expect(res.body.run.id).toBe('test-run');
    });
  });

  describe('GET /api/runs/latest', () => {
    it('returns the latest run', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 'run-1', status: 'finished' },
        error: null
      });

      const res = await request(app).get('/api/runs/latest');
      expect(res.status).toBe(200);
      expect(res.body.run.id).toBe('run-1');
    });
  });
});
