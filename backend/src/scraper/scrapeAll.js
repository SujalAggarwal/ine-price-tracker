import { supabase } from '../config/supabase.js';
import { scrapeProduct } from './scrapeProduct.js';
import { closeBrowser } from './browser.js';
import crypto from 'crypto';

const GLOBAL_RUN_DEADLINE_MS = 8 * 60 * 1000; // 8 minutes

/**
 * Runs scraper batch across all active due products sequentially.
 */
export async function scrapeAll(options = {}) {
  const startTime = Date.now();
  const runId = options.run_id || crypto?.randomUUID?.() || `run-${Date.now()}`;
  const isForce = options.force || false;
  const targetProductId = options.productId || null;

  console.log(`[ScrapeAll] Starting batch run ${runId} (force=${isForce}, targetProductId=${targetProductId || 'ALL'})`);

  let productsToScrape = [];

  // supabase.js now throws on missing config, so supabase is always available here
  let query = supabase.from('products').select('*');

  if (targetProductId) {
    query = query.or(`id.eq.${targetProductId},external_id.eq.${targetProductId}`);
  } else {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[ScrapeAll DB Error] Failed to fetch products:', error.message);
    return { runId, total: 0, success: 0, retried: 0, failed: 0, skipped: 0, error: error.message };
  }
  productsToScrape = data || [];

  // Filter products by due status using last_scraped_at (only updated on success)
  const now = Date.now();
  const dueProducts = productsToScrape.filter((p) => {
    if (isForce || targetProductId) return true;

    const intervalMinutes = p.scrape_interval_minutes || 120;
    const intervalMs = (intervalMinutes - 1) * 60 * 1000; // 1 min tolerance
    // Use last_scraped_at — only set on successful scrapes, never on failures
    const lastScrapedMs = p.last_scraped_at ? new Date(p.last_scraped_at).getTime() : 0;

    return (now - lastScrapedMs) >= intervalMs;
  });

  const total = dueProducts.length;
  let successCount = 0;
  let retriedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  try {
    for (let i = 0; i < dueProducts.length; i++) {
      const product = dueProducts[i];
      const elapsed = Date.now() - startTime;

      // Check global 8 minute deadline
      if (elapsed >= GLOBAL_RUN_DEADLINE_MS) {
        console.warn(`[ScrapeAll Warning] Global deadline of 8m reached. Skipping remaining ${total - i} products.`);
        skippedCount += (total - i);
        break;
      }

      console.log(`[ScrapeAll ${i + 1}/${total}] Scraping ${product.name || product.external_id}...`);
      const result = await scrapeProduct(product);

      if (result.success) {
        if (result.status === 'retried') {
          retriedCount++;
        } else {
          successCount++;
        }
      } else {
        failedCount++;
      }
    }
  } finally {
    // Ensure browser is closed after batch finishes
    await closeBrowser();
  }

  const durationMs = Date.now() - startTime;
  const summary = {
    runId,
    total,
    success: successCount,
    retried: retriedCount,
    failed: failedCount,
    skipped: skippedCount,
    durationMs: `${(durationMs / 1000).toFixed(2)}s`
  };

  console.log('[ScrapeAll Completed] Summary:', summary);
  return summary;
}
