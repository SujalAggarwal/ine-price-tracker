/**
 * Live 4-cycle verification run.
 * Scrapes products 1, 2, 767 four times (2 min apart) and writes
 * real rows to Supabase price_history and scrape_logs.
 */
import { scrapeProduct } from './src/scraper/scrapeProduct.js';
import { supabase } from './src/config/supabase.js';
import { closeBrowser } from './src/scraper/browser.js';

// Fetch the seeded products from DB so we pass the real UUID + url
const { data: products, error } = await supabase
  .from('products')
  .select('id, external_id, name, url')
  .in('external_id', ['1', '2', '767'])
  .order('external_id');

if (error || !products?.length) {
  console.error('Failed to fetch products from DB:', error?.message);
  process.exit(1);
}

console.log('Products loaded from Supabase:');
console.table(products.map(p => ({ id: p.id.slice(0, 8) + '...', external_id: p.external_id, name: p.name })));

const results = [];

for (let run = 1; run <= 4; run++) {
  console.log(`\n${'='.repeat(44)}`);
  console.log(`=== LIVE VERIFICATION RUN ${run}/4 (DB CONNECTED) ===`);
  console.log(`${'='.repeat(44)}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  for (const product of products) {
    console.log(`\n  Scraping product ${product.external_id} (${product.name})...`);
    const start = Date.now();
    const res = await scrapeProduct(product);
    res.run = run;
    res.external_id = product.external_id;
    results.push(res);
    console.log(`  Result for ${product.external_id}:`, JSON.stringify({
      success: res.success,
      status: res.status,
      price: res.price,
      currency: res.currency,
      stock: res.stock,
      attempts: res.attempts,
      durationMs: res.durationMs,
      errorType: res.errorType,
      errorMessage: res.errorMessage
    }, null, 2));
  }

  if (run < 4) {
    console.log(`\n  Waiting 2 minutes before run ${run + 1}...`);
    await new Promise(r => setTimeout(r, 120000));
  }
}

await closeBrowser();

// Query actual DB rows written
console.log('\n\n' + '='.repeat(50));
console.log('=== ACTUAL SUPABASE DATABASE ROWS ===');
console.log('='.repeat(50));

const { data: priceRows } = await supabase
  .from('price_history')
  .select('id, product_id, price, currency, stock, stock_status, captured_at')
  .order('captured_at', { ascending: false })
  .limit(20);

console.log('\n--- price_history table ---');
console.table(priceRows?.map(r => ({
  id: r.id.slice(0, 8) + '...',
  product_id: r.product_id.slice(0, 8) + '...',
  price: r.price,
  currency: r.currency,
  stock: r.stock,
  stock_status: r.stock_status,
  captured_at: r.captured_at
})));

const { data: logRows } = await supabase
  .from('scrape_logs')
  .select('id, product_id, status, http_status, response_time_ms, error_message, raw_payload, created_at')
  .order('created_at', { ascending: false })
  .limit(30);

console.log('\n--- scrape_logs table ---');
console.table(logRows?.map(r => ({
  id: r.id.slice(0, 8) + '...',
  product_id: r.product_id?.slice(0, 8) + '...',
  status: r.status,
  attempts: r.raw_payload?.attempts,
  error_type: r.raw_payload?.error_type || null,
  response_time_ms: r.response_time_ms,
  error_message: r.error_message?.slice(0, 60),
  created_at: r.created_at
})));

console.log('\n\n=== FULL VERIFICATION SUMMARY ===');
const summary = { success: 0, retried: 0, failed: 0 };
for (const r of results) {
  summary[r.status] = (summary[r.status] || 0) + 1;
}
console.log(`Total scrape attempts across 4 runs × 3 products = 12`);
console.table(summary);

process.exit(0);
