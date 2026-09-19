import { getBrowser, createProductContext } from './browser.js';
import { extractProductPage } from './extract.js';
import { parsePrice, normalizeStock } from './parse.js';
import { validateScrapedData, checkPriceSanity } from './validate.js';
import { withRetry, ScrapeError } from './retry.js';
import { supabase } from '../config/supabase.js';

/**
 * Scrapes a single product by ID or database product object.
 * Enforces all core rules:
 * - Failed scrape writes ONLY a scrape_logs row (status=failed), NEVER a price row.
 * - Log status is strictly 'success', 'retried', or 'failed'.
 * - Closes browser context in finally block.
 */
export async function scrapeProduct(product, options = {}) {
  const startTime = Date.now();
  const productId = typeof product === 'object' ? product.id : product;
  const storeProductId = typeof product === 'object' ? product.external_id : product;
  const productUrl = typeof product === 'object' && product.url 
    ? product.url 
    : `https://demo.inelabteamdev.com/product/${storeProductId}`;

  let attemptsUsed = 1;

  try {
    const { result, attempts } = await withRetry(async (currentAttempt) => {
      attemptsUsed = currentAttempt;
      let context = null;
      let page = null;

      try {
        const browser = await getBrowser();
        const ctxObj = await createProductContext(browser);
        context = ctxObj.context;
        page = ctxObj.page;

        // 1. Extract raw strings from Playwright page
        const extracted = await extractProductPage(page, productUrl);

        const parsedPrice = parsePrice(extracted.rawPriceText);
        const parsedStock = normalizeStock(extracted.rawStockText);

        // 3. Validate parsed data against Zod schema
        const validated = validateScrapedData({
          price: parsedPrice.price,
          currency: parsedPrice.currency,
          stock_status: parsedStock.status,
          stock: parsedStock.quantity
        });

        // 4. Sanity check versus last known price (if available)
        let warningNote = null;
        if (typeof product === 'object' && product.latest_price?.price) {
          const sanity = checkPriceSanity(validated.price, Number(product.latest_price.price));
          if (sanity.isSuspect) {
            warningNote = sanity.warning;
            // If suspect price on first attempt, retry once to confirm
            if (currentAttempt === 1) {
              throw new ScrapeError(`Price change > 5x detected, retrying once to confirm: ${sanity.warning}`, 'suspect_price', true);
            }
          }
        }

        return {
          ...validated,
          warningNote,
          selectorUsed: extracted.selectorUsed
        };
      } finally {
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }, { maxAttempts: 4, baseDelayMs: 1500 });

    const durationMs = Date.now() - startTime;
    const finalStatus = attempts > 1 ? 'retried' : 'success';

    // SUCCESS / RETRIED: Write 1 price row & 1 scrape_logs row
    if (productId) {
      // 1. Insert price row
      try {
        const { error: priceErr } = await supabase.from('price_history').insert({
          product_id: productId,
          price: result.price,
          currency: result.currency,
          stock: result.stock,
          stock_status: result.stock_status,
          captured_at: new Date().toISOString()
        });
        if (priceErr) {
          console.error(`[DB Error] Failed to insert price row for product ${productId}:`, priceErr.message);
        }
      } catch (dbErr) {
        console.error(`[DB Error] price_history insert threw:`, dbErr.message);
      }

      // 2. Insert scrape_logs row
      const logMessage = result.warningNote
        ? `Successfully scraped price: ${result.currency} ${result.price} (${result.warningNote})`
        : `Successfully scraped price: ${result.currency} ${result.price}`;

      try {
        const { error: logErr } = await supabase.from('scrape_logs').insert({
          product_id: productId,
          status: finalStatus,
          http_status: 200,
          response_time_ms: durationMs,
          error_message: logMessage,
          raw_payload: {
            attempts,
            price: result.price,
            currency: result.currency,
            stock: result.stock,
            stock_status: result.stock_status,
            selectorUsed: result.selectorUsed,
            warning: result.warningNote
          }
        });
        if (logErr) {
          console.error(`[DB Error] Failed to insert scrape_log for product ${productId}:`, logErr.message);
        }
      } catch (dbErr) {
        console.error(`[DB Error] scrape_logs insert threw:`, dbErr.message);
      }

      // 3. Update products last_scraped_at timestamp (only on success)
      try {
        await supabase.from('products').update({
          last_scraped_at: new Date().toISOString()
        }).eq('id', productId);
      } catch (dbErr) {
        console.error(`[DB Error] products last_scraped_at update threw:`, dbErr.message);
      }
    }

    return {
      success: true,
      status: finalStatus,
      productId,
      storeProductId,
      price: result.price,
      stock: result.stock,
      attempts,
      durationMs,
      warning: result.warningNote
    };

  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorType = err.errorType || (
      err.name === 'StructureChangedError' ? 'structure_changed' :
      err.name === 'ValidationError' ? 'validation_error' :
      err.name === 'StoreHttpError' ? 'http_error' :
      'unexpected'
    );
    const httpStatus = err.statusCode || (err.name === 'ScrapeTimeoutError' ? 504 : 500);

    console.error(`[ScrapeProduct Error] ${err.name} (${errorType}): ${err.message}`);

    // FAILURE: Write ONLY a scrape_logs row (status=failed). NEVER a price row.
    if (productId) {
      try {
        const { error: logErr } = await supabase.from('scrape_logs').insert({
          product_id: productId,
          status: 'failed',
          http_status: httpStatus,
          response_time_ms: durationMs,
          error_message: `[${errorType.toUpperCase()}] ${err.message}`,
          raw_payload: {
            attempts: err.attempts || attemptsUsed,
            error_type: errorType,
            error_name: err.name,
            stack: err.stack
          }
        });
        if (logErr) {
          console.error('[DB Error] Failed to insert failure log:', logErr.message);
        }
      } catch (dbErr) {
        console.error('[DB Error] scrape_logs failure insert threw:', dbErr.message);
      }
    }

    return {
      success: false,
      status: 'failed',
      productId,
      storeProductId,
      errorType,
      errorMessage: err.message,
      attempts: err.attempts || attemptsUsed,
      durationMs
    };
  }
}
