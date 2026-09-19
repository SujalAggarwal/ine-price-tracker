# STORE RECONNAISSANCE REPORT
**Target:** https://demo.inelabteamdev.com/
**Date:** 2026-09-19
**Method:** Plain HTTP fetch, JavaScript bundle analysis (downloaded and grepped), PowerShell timing loops.

---

## Summary Table

| Endpoint / Page | Purpose | How Data Is Delivered | Selectors / JSON Paths |
|---|---|---|---|
| GET / | Home page product grid | React SPA; div#root is empty in raw HTML | N/A (JS-rendered) |
| GET /product/:id | Product detail page | Same SPA shell | N/A (JS-rendered) |
| GET /api/catalog?page=N&pageSize=N | Paginated product list (1000 products, 50 pages x 20) | JSON API | .items[].id, .items[].name, .items[].slug, .items[].category, .items[].brand, .items[].sku, .page, .pages, .total |
| GET /api/product/:id | Static product detail (specs, reviews) -- NO price, NO stock | JSON API | .id, .name, .brand, .category, .sku, .description, .specs.*, .reviews[] |
| GET /api/layout | Dynamic CSS class map -- rotates per revision | JSON API | .classes.priceValue, .classes.stock, .classes.priceWrap, .classes.mrp, .classes.badge, .revision, .validUntil, .order[], .priceTag, .priceCarrier |
| GET /api/product/:id + price reveal | Live price + stock -- requires bot-detection challenge | Protected JS-orchestrated multi-step fetch | m.shown (price), m.stock, m.currency, m.mrp, m.sale, m.badgePct, m.rating, m.ratingCount, m.seller, m.deliveryDays |
| GET /robots.txt | Robots policy | NOT a text file -- returns SPA HTML (SPA router intercepts) | N/A |

---

## Section 1 -- Product List and Search

### Product List
Products are displayed as a paginated grid. The only supported query parameters on the catalog API are:

```
GET /api/catalog?page={N}&pageSize={N}
```

- **Total products:** 1,000 (confirmed from "total":1000 in API response)
- **Page size default:** 20
- **Total pages:** 50
- **Items per response:** Array of 20 objects: id, slug, name, brand, category, sku, description
- **Pagination:** URL changes to /?page=N (React Router), triggers GET /api/catalog?page=N

### Search

**Search is CLIENT-SIDE ONLY. There is no search endpoint on the server.**

Evidence:
1. GET /api/catalog?search=cable -> returns 20 random, unrelated products (server ignores parameter)
2. GET /api/catalog?q=cable -> same result, different random 20 products
3. GET /api/products?search=cable -> HTTP 404
4. GET /api/search?q=cable -> HTTP 404
5. Source code: the home page component rr() calls qn(n) where n = Number(e.get("page")). No search query is forwarded to the server.

**To search by product name:** Fetch ALL 50 pages of /api/catalog and filter client-side by name.toLowerCase().includes(query.toLowerCase()).

---

## Section 2 -- Data Delivery

### Initial HTML
Every URL (including /, /product/767, and /robots.txt) returns IDENTICAL HTML:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>INE Store</title>
    <script type="module" crossorigin src="/assets/index-B9UiQq4X.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-DrctpSuy.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

div#root is COMPLETELY EMPTY. All content rendered by React 19.3.0 SPA.

### API Calls Made by the App (from bundle analysis)

| Call | Method | URL | Triggered By | Response |
|---|---|---|---|---|
| Catalog | GET | /api/catalog?page=N&pageSize=20 | Page load / pagination | JSON, 20 product stubs |
| Product detail | GET | /api/product/:id | Product page load | JSON, static data (no price/stock) |
| Layout | GET | /api/layout | Product page load | JSON, CSS class map |
| Bot challenge token | POST | Obfuscated endpoint | "Reveal price" click | JSON {token} |
| Price quote | GET | Obfuscated /api/...s/:id/... with Bearer token | After token obtained | JSON with price, stock, seller |

**Source code (from bundle.js):**
```javascript
async function qn(e, t=20) {
  let n = await fetch(`/api/catalog?page=${e}&pageSize=${t}`);
  if (!n.ok) throw Error(`catalog ${n.status}`);
  return n.json();
}
async function Jn(e) {
  let t = await fetch(`/api/product/${e}`);
  if (!t.ok) throw Error(`product ${t.status}`);
  return t.json();
}
async function Yn() {
  let e = await fetch(`/api/layout`);
  if (!e.ok) throw Error(`layout ${e.status}`);
  return e.json();
}
```

The price/quote fetch (Dr) is heavily obfuscated using a string rotation cipher (P(N) calls). It:
1. Computes a canvas fingerprint hash (ar())
2. Computes a WebGL fingerprint hash (or())
3. Captures 8+ animation frame timing intervals (sr(8))
4. POSTs all of this to a token endpoint
5. Uses the returned Bearer token to GET price from /api/...s/:productId/...
6. Status 429 -> retryable (class Er); 401/403 -> not retryable (class Tr)

---

## Section 3 -- Price and Stock Selectors / JSON Paths

### Via JSON (from price quote response object)

| Field | Type | Description |
|---|---|---|
| m.shown | number | Current selling price (THE value to store) |
| m.currency | string | Currency code e.g. "INR" |
| m.mrp | number | Original/strikethrough price |
| m.sale | number or undefined | Deal price (only if m.triple is true) |
| m.badgePct | number | Discount percentage |
| m.stock | number | Stock count (0 = out of stock) |
| m.rating | number | Aggregate rating 0-5 |
| m.ratingCount | number | Total rating count |
| m.seller | string | Seller name |
| m.deliveryDays | number | Days until delivery |
| m.pending | boolean | True while price is updating (opacity 0.45) |

### Via DOM (Playwright only -- DANGER: classes rotate)

Current layout revision 626001 class names:

| Semantic Name | Current Class | Element |
|---|---|---|
| priceWrap | pw-m4 | outer div of price block |
| priceValue | pv-m4 | output or span containing price text |
| mrp | mr-m4 | strikethrough price span |
| sale | sl-m4 | deal price span |
| badge | bd-m4 | discount % badge |
| rating | rt-m4 | rating container |
| seller | sr-m4 | seller div |
| delivery | dl-m4 | delivery date div |
| stock | st-m4 | stock badge container div |

**Static classes (appear stable):**
- .price-block -- price section wrapper
- .price-idle -- state: hidden/not yet revealed
- .price-success -- state: price shown
- .price-error -- state: all retries failed
- .stock-badge.in-stock -- in-stock badge
- .stock-badge.out-stock -- out-of-stock badge
- .price-status -- status text paragraph

**Correct Playwright selector:**
```javascript
const layout = await page.evaluate(() => fetch('/api/layout').then(r => r.json()));
const priceClass = layout.classes.priceValue; // e.g. "pv-m4"
await page.locator('.price-block.price-success').waitFor();
const priceText = await page.locator(`.${priceClass}:visible`).textContent();
const stockText = await page.locator('.stock-badge').textContent().catch(() => 'unknown');
```

---

## Section 4 -- Asynchronous Content

### Loading Sequence (Product Detail Page)
1. **0 ms:** SPA shell renders. div#root fills with React structure.
2. **~50-300 ms:** GET /api/product/:id and GET /api/layout fire in parallel.
3. **After API resolves:** Product name, brand, specs, reviews render. Price block shows phase "idle".
4. **On user hover:** Bot-detection challenge starts. Mouse movement tracked for minDwellMs.
5. **On "Reveal price" click:** Token fetch -> authenticated price fetch.

### Loading Placeholder Text (exact strings from source code)

| Phase | Exact Text Shown | Selector |
|---|---|---|
| Catalog loading | "Loading products..." | div.grid-empty |
| Price idle | "Price hidden" | p.price-status |
| Price idle sub | "Check the current price and availability." | p.price-substatus |
| Price loading | "Loading current price..." | p.price-status |
| Price retrying | "Retrying (attempt N/M)..." | p.price-status |
| Price error | "Couldn't load the price after N attempts." | p.price-status |
| Product error | "Couldn't load this product: [error]" | div.grid-empty.grid-error |

### Cookie Consent Popup

Appears at RANDOM delay between 1,500 ms and 5,000 ms after page load:
```javascript
var Gn = 1500, Kn = 5e3;
let e = Gn + Math.random() * (Kn - Gn);
let n = window.setTimeout(() => t(true), e);
```
Position: "bottom" (70%), "top" (25%), "center" (5%).
Traps keyboard focus. Must be dismissed before "Reveal price" can be clicked.

---

## Section 5 -- Failure Modes

### Intentionally Injected Bot Failures (from source code)
```javascript
function Xn(e) {
  return () => {
    if (Math.random() < .35) {       // 35% of the time: FAIL
      if (Math.random() < .5) return; // 50%: silent drop (nothing happens)
      window.setTimeout(e, 900);      // 50%: 900ms delay then succeed
      return;
    }
    e();                              // 65%: immediate success
  };
}
```

This wraps the "Reveal price" button click handler:
- ~17.5% of clicks: SILENT DROP (no loading state, no error, nothing)
- ~17.5% of clicks: 900ms artificial delay then succeeds
- ~65% of clicks: immediate success

### API-Level Errors

| Status | Meaning | Retryable |
|---|---|---|
| 200 | Success | -- |
| 404 | Endpoint not found | No |
| 429 | Rate limited / bot check | Yes |
| 401/403 | Auth failure | No |
| Other non-ok | Generic error | Yes |

Retry backoff: await Pr(300 * attempt_number) ms

### Robots.txt
GET /robots.txt -> HTTP 200 but body is SPA HTML. No conventional robots file found. No explicit Disallow rules.

---

## Section 6 -- Stock Representation

| Value | CSS Class | When |
|---|---|---|
| "Out of stock" | stock-badge out-stock | m.stock === 0 |
| [formatted count from zr(m.stock)] | stock-badge in-stock | m.stock > 0 |

The zr() function is obfuscated; exact output format NOT OBSERVED (likely "N left" or "In stock").
The numeric m.stock in the JSON quote is the ground truth.

---

## Section 7 -- Price Format

- **Currency:** INR, Indian Rupee (symbol: Rs.)
- **Locale:** en-IN (confirmed from toLocaleDateString("en-IN"))
- **Thousands separator:** comma (Indian system: Rs.4,999)
- **Decimals:** NOT OBSERVED (Fr(Br(price), currency) format function -- may omit for whole amounts)
- **Fields:** m.shown (current), m.mrp (strikethrough), m.sale (deal, conditional), m.badgePct (% off)
- **Display:** "[strikethrough MRP] [Deal price Rs.X] Rs.4,999 [17% off]"

### CRITICAL WARNING -- Wrong Value Trap
```javascript
d1: Fr(Br(e.shown), e.currency)     // hidden span -- obfuscated
d2: Fr(Br(e.shown + 7), e.currency) // hidden span -- shown + 7 (WRONG by design)
```

The span with data-price="true" contains shown + 7 (real price plus 7 rupees). DO NOT READ IT.
The span with class="price-value" contains d1 (obfuscated). DO NOT READ IT.
The REAL price is in the visible .priceValue element (pv-m4 currently).

---

## Section 8 -- Structural Quirks

1. **Rotating CSS class names (CRITICAL):** /api/layout returns classes that change on revision bump.
   validUntil: 1789818376939 ms epoch. After expiry, pv-m4 becomes something else silently.
   Always fetch /api/layout before each scrape session.

2. **priceTag field:** Layout specifies whether price element is "output" or "span".
   Current: "output". A selector for span.pv-m4 FAILS. Use .pv-m4 (any element).

3. **priceCarrier = "split":** Price string rendered with Lr(h) which splits digits. May insert
   invisible characters. Use .textContent() not character-level parsing.

4. **Rotating noise class:** Price element className = "${d.rot} ${priceValue}" where d.rot = "v{random}".
   Every render gets a new class like v42, v91. Do NOT target this class.

5. **Hidden obfuscated spans (traps):**
   - span.price-value (display:none) -> d1, obfuscated
   - span[data-price="true"] (display:none) -> d2 = shown + 7 (wrong by design)

6. **Seller name split:** Seller rendered as slice(0,3) + invisible char + slice(3). Use textContent.trim().

7. **Cookie consent popup:** 1500-5000ms delay, random position, focus-trapped dialog.

8. **No real robots.txt:** /robots.txt returns SPA HTML.

9. **Catalog order non-deterministic:** Same page=1 request returns different product sets each call.

10. **35% click failure rate:** Button click is wrapped in Xn(e) which silently drops 17.5% and delays 17.5%.

---

## Section 9 -- Variance Testing

### /api/product/767 (20 requests)

| Metric | Value |
|---|---|
| Min | 62 ms |
| Median | 68 ms |
| Max | 284 ms (cold start) |
| Errors | 0 / 20 |
| Price in response | NOT PRESENT |
| Content variance | None -- identical JSON every call |

### /api/catalog?page=1 (20 requests)

| Metric | Value |
|---|---|
| Min | 60 ms |
| Median | 74 ms |
| Max | 289 ms (cold start) |
| Errors | 0 / 20 |
| Product order variance | YES -- different 20 products each call |

### /api/layout (10 requests)

| Metric | Value |
|---|---|
| Min | 62 ms |
| Median | 76 ms |
| Max | 259 ms (cold start) |
| Errors | 0 / 10 |
| revision | 626001 -- identical all calls |
| classes | Identical all calls (no rotation observed during test) |

Note: The 35% failure rate is injected in frontend JS, not at server level. APIs themselves are stable.

---

## Section 10 -- Politeness

- /robots.txt: HTTP 200, body is SPA HTML, no Disallow directives found
- No server-side rate limiting observed on catalog, product, or layout endpoints
- Price endpoint responds with 429 as part of bot-detection puzzle (not a real rate limit)
- 2-hour polling for a single product is well within any reasonable threshold
- Recommended minimum: 1-second delay between successive requests

---

## Timing Summary Table

| Endpoint | Requests | Min (ms) | Median (ms) | Max (ms) | Errors |
|---|---|---|---|---|---|
| /api/product/767 | 20 | 62 | 68 | 284 | 0 |
| /api/catalog?page=1 | 20 | 60 | 74 | 289 | 0 |
| /api/layout | 10 | 62 | 76 | 259 | 0 |
| Price quote endpoint | N/A | N/A | N/A | N/A | Inaccessible (bot-protected) |

---

## Scraper Pitfalls

1. Plain HTTP fetch/Cheerio returns empty div#root -- zero product data visible.
2. data-price="true" span contains shown + 7 (wrong by design). DO NOT read.
3. span.price-value is hidden and obfuscated (not real price). DO NOT read.
4. CSS classes rotate on layout revision -- hardcoded pv-m4 breaks silently after validUntil.
5. priceTag can be "output" not "span" -- span.pv-m4 selector fails.
6. 35% of clicks are silently dropped -- no loading state, no error. Must detect and retry.
7. Cookie consent popup (1.5-5s delay) blocks button click -- must dismiss first.
8. Catalog order is non-deterministic -- cannot find product by page position.
9. Search is client-side only -- /api/catalog?search=X returns random unrelated products.
10. validUntil expiry causes silent class rotation -- check layout before each session.
11. /api/product/:id has NO price or stock -- static endpoint only.
12. Silent drop (17.5% of clicks): no state change at all. Scraper must timeout and retry.

---

## RECOMMENDATION

### -> (c) Playwright -- REQUIRED

**Justification:**
Plain HTTP fetch is completely insufficient -- every URL returns an empty SPA shell.
The price data requires:
1. Full JavaScript execution to render the price block
2. User interaction to click "Reveal price"
3. Bot-detection challenge (canvas/WebGL fingerprint + mouse movement + bearer token)
4. Cookie consent popup dismissal

Neither (a) direct JSON API nor (b) HTTP fetch + Cheerio can retrieve price/stock data.
The accessible JSON endpoints (/api/catalog, /api/product/:id, /api/layout) contain NO price or stock.

**Step requiring Playwright:** The "Reveal price" button click on /product/:id, which triggers the
bot-detection challenge requiring browser-rendered canvas fingerprints and tracked mouse movement.

**Readiness condition to wait for:** `.price-block.price-success` selector becomes visible.

### Playwright Implementation Requirements

| Requirement | Reason |
|---|---|
| Real browser (non-headless or stealth-mode) | Canvas/WebGL fingerprint required |
| Fetch /api/layout at session start | Get current dynamic CSS classes |
| Wait for .price-block.price-success | Price loaded and revealed |
| Dismiss .cookie-banner button before clicking | Popup traps focus |
| Retry click up to 5x if no state change in 2s | 35% silent drop rate |
| Read price from .${layout.classes.priceValue} | Dynamic class, not hardcoded |
| DO NOT read span.price-value or [data-price] | Wrong/obfuscated values |

```javascript
// Step 1: Get current layout classes
const layout = await page.evaluate(() => fetch('/api/layout').then(r => r.json()));

// Step 2: Navigate and dismiss cookie popup
await page.goto(`/product/${productId}`);
const cookieDismiss = page.locator('.cookie-banner button').first();
try {
  await cookieDismiss.waitFor({ timeout: 6000 });
  await cookieDismiss.click();
} catch {}

// Step 3: Reveal price with retry for 35% silent drop
for (let i = 0; i < 5; i++) {
  const revealBtn = page.locator('button[aria-label="Reveal price"]');
  if (await revealBtn.isVisible()) await revealBtn.click();
  const ok = await page.locator('.price-block.price-success')
    .waitFor({ timeout: 3000 }).catch(() => null);
  if (ok) break;
}

// Step 4: Read price (dynamic class from layout)
const priceClass = layout.classes.priceValue;
const priceText = await page.locator(`.${priceClass}:visible`).textContent();

// Step 5: Read stock
const stockText = await page.locator('.stock-badge').textContent().catch(() => 'unknown');
const outOfStock = await page.locator('.stock-badge.out-stock').isVisible();
```

---

## Top 5 Risks to Scraping Reliability

1. **Bot-detection challenge (canvas + mouse movement + bearer token):** Price reveal requires
   multi-step challenge. Headless browser without realistic mouse movement fails with 429 or 401/403.
   Risk: price cannot be fetched at all.

2. **CSS class rotation via /api/layout:** Classes change on revision bump (validUntil timestamp).
   After expiry, hardcoded selectors silently return null with no error.
   Risk: price stored as null/empty without awareness.

3. **35% silent drop on "Reveal price" click:** Random.random() < 0.35 discards or delays click.
   Without retry + state-change detection, scraper silently fails 17.5% of the time.
   Risk: scraper completes run with stale or empty price.

4. **data-price / price-value spans contain wrong values:** d2 = shown + 7 is a deliberate trap
   in display:none span. Storing this gives systematically wrong price (off by exactly 7).
   Risk: consistently wrong price stored.

5. **Cookie consent popup blocks button interaction:** Appears at 1500-5000ms, traps keyboard focus,
   prevents clicking "Reveal price". Scraper without popup dismissal always times out.
   Risk: Playwright times out on every price fetch attempt.

---
*End of STORE_RECON.md*
