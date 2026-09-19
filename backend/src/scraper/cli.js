import { scrapeAll } from './scrapeAll.js';
import crypto from 'crypto';

async function main() {
  const args = process.argv.slice(2);
  let isForce = false;
  let productId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force') {
      isForce = true;
    }
    if (args[i] === '--product' && args[i + 1]) {
      productId = args[i + 1];
      i++;
    }
  }

  const runId = crypto.randomUUID();
  console.log(`=== INE Price Tracker CLI Scraper ===`);
  console.log(`Run ID: ${runId}`);
  console.log(`Force: ${isForce}`);
  if (productId) console.log(`Target Product: ${productId}`);
  console.log(`=====================================\n`);

  try {
    const summary = await scrapeAll({
      run_id: runId,
      force: isForce,
      productId: productId
    });

    console.log(`\n=====================================`);
    console.log(`Scrape Run Finished:`);
    console.log(`  Total Due:  ${summary.total}`);
    console.log(`  Success:    ${summary.success}`);
    console.log(`  Retried:    ${summary.retried}`);
    console.log(`  Failed:     ${summary.failed}`);
    console.log(`  Skipped:    ${summary.skipped}`);
    console.log(`  Duration:   ${summary.durationMs}`);
    console.log(`=====================================\n`);

    process.exit(0);
  } catch (err) {
    console.error('[CLI Error] Scrape run failed:', err);
    process.exit(1);
  }
}

main();
