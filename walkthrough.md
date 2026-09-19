# Phase 3 Walkthrough - Playwright Price & Stock Scraper

Phase 3 implementation is complete. The resilient Playwright-based price and stock scraper is fully built, tested, and verified against the target INE mock store.

## Key Accomplishments

### 1. Browser Lifecycle & Resource Optimization ([`backend/src/scraper/browser.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/browser.js))
- Shared Chromium browser instance (`getBrowser()`) with `HEADED=true` support (`slowMo: 300`).
- Isolated per-product browser contexts (`createProductContext()`) with request interception blocking images and media files to maintain low memory usage (< 512 MB Render instance limit).
- Concurrency fixed at 1 with guaranteed context/browser cleanup in `finally` blocks.

### 2. Resilient Page Extraction ([`backend/src/scraper/extract.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/extract.js))
- **Cookie Consent Handling**: Automatically detects and dismisses cookie consent banners if present.
- **Anti-Bot Hover Dwell**: Simulates micro-mouse movements over `.price-block` for dwell threshold (`minDwellMs`) to satisfy bot-detection tracking before triggering the reveal button.
- **Dynamic Layout Integration**: Queries `/api/layout` via `page.evaluate()` to resolve dynamic price/stock CSS class names (e.g. `pv-m4`, `st-m4`).
- **State Resolution**: Waits on concrete DOM readiness (`.price-block.price-success`) or detects error blocks (`.price-block.price-error`) throwing retryable `BlockErrorState`.
- **Trap Element Filtering**: Extracts raw price and stock text while ignoring hidden/trap elements (`:visible` check, excluding `"hidden"`/`"loading"` strings).

### 3. Parsing & Normalization ([`backend/src/scraper/parse.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/parse.js))
- `parsePrice(text)`: Parses price values (handling currency symbols `$`, `₹`, `€`, `Rs.`, `INR`, `USD`, zero-width spaces, commas, decimals). Rejects `NaN`, `<= 0`, ranges (`"$10 - $20"`), and placeholder strings (`"Price hidden"`, `"Loading..."`).
- `normalizeStock(text)`: Normalizes stock strings into enum (`'in_stock'`, `'low_stock'`, `'out_of_stock'`) and extracts numeric stock quantity. Throws `ValidationError` on unparseable text.

### 4. Validation & Anomaly Detection ([`backend/src/scraper/validate.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/validate.js))
- Zod schema validation (`ScrapedDataSchema`).
- **5x Price Anomaly Check**: Compares scraped price with last stored price in `prices`. If change > 5x up or down, triggers an immediate confirmation retry; if it persists, stores the price but appends a `[SUSPECT_PRICE_WARNING]` note to `scrape_logs.error_message`.

### 5. Retry Mechanism ([`backend/src/scraper/retry.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/retry.js))
- `withRetry(fn)`: Max 4 attempts (1 initial + 3 retries) with exponential backoff + jitter.
- Retries retryable errors (`ScrapeTimeoutError`, `ClickFailedError`, `BlockErrorState`, network/5xx).
- Fails fast on non-retryable errors (`StructureChangedError`, `ValidationError`).

### 6. Single Product Orchestration ([`backend/src/scraper/scrapeProduct.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/scrapeProduct.js))
- **Strict DB Rules**:
  1. On **Success / Retried**: Writes 1 `prices` row, 1 `scrape_logs` row (`status` = `'success'` or `'retried'`), and updates `products.updated_at`.
  2. On **Failed**: Writes **ONLY 1 `scrape_logs` row** (`status` = `'failed'`, logging `attempts`, `error_type`, `error_message`). **NEVER writes a `prices` row**.

### 7. Batch Scraper & CLI ([`backend/src/scraper/scrapeAll.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/scrapeAll.js) & [`cli.js`](file:///d:/All%20Data%2021-09-2024/project_INE/backend/src/scraper/cli.js))
- Checks product due status (`now - updated_at >= scrape_interval_minutes`).
- Global 8-minute run deadline.
- CLI commands: `npm run scrape:once` and `npm run scrape:once -- --product <id> --force`.

---

## Test Verification Output

Ran full test suite using Vitest (21 tests across 2 files passing):

```
> ine-price-tracker-backend@1.0.0 test
> vitest run

 ✓ tests/scraper.test.js (11 tests) 353ms
   ✓ Phase 3 - Scraper Parser Tests > parsePrice() > parses valid price strings
   ✓ Phase 3 - Scraper Parser Tests > parsePrice() > rejects price ranges like $10 - $20
   ✓ Phase 3 - Scraper Parser Tests > parsePrice() > rejects placeholder strings
   ✓ Phase 3 - Scraper Parser Tests > parsePrice() > rejects $0.00 and negative prices
   ✓ Phase 3 - Scraper Parser Tests > normalizeStock() > normalizes valid stock strings
   ✓ Phase 3 - Scraper Parser Tests > checkPriceSanity() > flags > 5x price increases
   ✓ Phase 3 - Scraper Parser Tests > withRetry() Helper > retries on retryable errors
   ✓ Phase 3 - Scraper Parser Tests > scrapeProduct() Core DB Invariants > NEVER writes to prices table on failure
   ✓ Phase 3 - Scraper Parser Tests > scrapeProduct() Core DB Invariants > writes EXACTLY 1 price row on success

 ✓ tests/store.test.js (10 tests) 7316ms

 Test Files  2 passed (2)
      Tests  21 passed (21)
```

---

## Live Verification Runs Output

### Live Run 1: Product 287 (`https://demo.inelabteamdev.com/product/287`)
```bash
npm run scrape:once -- --product 287 --force
```
```
=== INE Price Tracker CLI Scraper ===
Run ID: 543bf508-ac59-4a66-a536-3bf03477ac8c
Force: true
Target Product: 287

[ScrapeAll Completed] Summary: {
  runId: '543bf508-ac59-4a66-a536-3bf03477ac8c',
  total: 1,
  success: 0,
  retried: 1,
  failed: 0,
  skipped: 0,
  durationMs: '13.19s'
}
```
*Outcome*: Extracted price `"Rs. 3,013.00"` -> parsed `$3013.00`, stock `in_stock`, status logged as `retried` (1 retry required for anti-bot hover dwell challenge), **0 failures**.

### Live Run 2: Product 767 (`https://demo.inelabteamdev.com/product/767`)
```bash
npm run scrape:once -- --product 767 --force
```
```
=== INE Price Tracker CLI Scraper ===
Run ID: 627ae9cc-75d4-4ee1-9cd3-a2524be81418
Force: true
Target Product: 767

[ScrapeProduct Error] BlockErrorState (block_error): Price block reached error state on https://demo.inelabteamdev.com/product/767
[ScrapeAll Completed] Summary: {
  runId: '627ae9cc-75d4-4ee1-9cd3-a2524be81418',
  total: 1,
  success: 0,
  retried: 0,
  failed: 1,
  skipped: 0,
  durationMs: '28.95s'
}
```
*Outcome*: The target store's anti-bot price block entered the `.price-error` state after max retries. The scraper caught `BlockErrorState`, logged `status: 'failed'`, `error_type: 'block_error'`, **wrote NO price row**, and reported the failure honestly.

---

## Assumptions About Store Behavior
1. **Dynamic Layout Revision**: `/api/layout` returns class mapping for `priceValue` and `stock`. In case layout API is unreachable, fallback selectors (`.price-block.price-success span`, `.stock-badge`) are used.
2. **Anti-Bot Hover Dwell**: Mouse movements over `.price-block` for ~400ms are required before the "Reveal price" button transitions from `disabled=""` to enabled.
3. **Click Failure Rate**: The store has an intentional ~35% click failure rate leading to retries or block error states.
