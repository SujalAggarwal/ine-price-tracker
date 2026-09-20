# Design & Implementation Note

## Scraping Reliability Strategy
The mock storefront is intentionally hostile to scraping—elements load asynchronously, requests timeout, and anti-bot mechanisms trigger pseudo-errors (e.g., "block error states"). To make the scraper reliable across unattended runs, the following strategies were implemented:

1. **Headless Browser (Playwright):** 
   While lightweight HTTP fetching is preferred, the mock store requires complex JavaScript rendering and interaction (specifically, a "Reveal Price" button that only appears after a random delay and requires mouse dwell time to bypass bot detection). Playwright was necessary to mimic human interaction.

2. **Retry Logic & Graceful Failures:**
   The `extract.js` scraper uses a robust retry loop for element selection and interactions. If a "BlockErrorState" or "ClickFailedError" occurs (which is common due to the store's intentional flakiness), the scraper catches these explicitly. It does **not** store incorrect data or crash the server; instead, it logs the exact failure state to the `scrape_logs` table and gracefully proceeds to the next item.

3. **Stateless Cron Triggers:**
   To accommodate free-tier hosting (which sleeps after inactivity), the scraping loop is not an always-on interval in Node.js. Instead, the backend exposes a secured `POST /api/cron/scrape` endpoint. An external cron service pings this endpoint, waking the server and executing a batch scrape.

## Trade-offs Made
- **Playwright Overhead vs. Lightweight Fetch:** Opting for Playwright increases memory overhead and deployment complexity (requiring a custom Dockerfile on Render). However, it was a necessary trade-off to accurately interact with the dwell-time anti-bot mechanisms.
- **Database Normalization:** We split `products`, `price_history`, and `scrape_logs` into separate tables. While this requires more complex joins on the frontend, it ensures a highly scalable and honest historical log, preventing price arrays from bloating the core product document.

## AI Tools: First Attempts & Corrections
During development, AI assistance was heavily utilized, but required several manual corrections:
- **Misinterpreting the Anti-Bot Logic:** Initially, the AI suggested simple `page.click('.price-reveal')` commands. This failed because the mock store checks for mouse movement and dwell time before accepting clicks. The AI's code had to be corrected to include `page.mouse.move()` and `page.waitForTimeout()` to simulate human hovering.
- **Data Schema Mismatches:** The AI initially mismatched the primary keys, trying to use `productId` from the store as the primary UUID in Supabase, leading to UPSERT conflicts. This was corrected by defining an `external_id` (store ID) and a separate native UUID for our internal relations.
- **Deployment Oversights:** The AI initially attempted to deploy Playwright on Render's native Node.js environment, which failed due to missing OS-level browser dependencies. We corrected this by shifting the backend to a Docker-based deployment using the official Playwright base image.
