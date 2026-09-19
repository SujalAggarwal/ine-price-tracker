import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parsePrice, normalizeStock, ValidationError } from '../src/scraper/parse.js';
import { checkPriceSanity } from '../src/scraper/validate.js';
import { withRetry, ClickFailedError } from '../src/scraper/retry.js';
import { StructureChangedError } from '../src/errors/errors.js';
import { scrapeProduct } from '../src/scraper/scrapeProduct.js';
import * as extractModule from '../src/scraper/extract.js';
import * as browserModule from '../src/scraper/browser.js';
import * as supabaseConfig from '../src/config/supabase.js';

describe('Phase 3 - Scraper Parser Tests', () => {
  describe('parsePrice()', () => {
    it('parses valid price strings with currency symbols and commas', () => {
      expect(parsePrice('$49.99')).toEqual({ price: 49.99, currency: 'USD' });
      expect(parsePrice('₹ 1,299.50')).toEqual({ price: 1299.5, currency: 'INR' });
      expect(parsePrice('1500 USD')).toEqual({ price: 1500, currency: 'USD' });
      expect(parsePrice('45.50')).toEqual({ price: 45.5, currency: 'USD' });
    });

    it('rejects price ranges like $10 - $20', () => {
      expect(() => parsePrice('$10 - $20')).toThrow(ValidationError);
    });

    it('rejects placeholder strings like Price hidden or Loading...', () => {
      expect(() => parsePrice('Price hidden')).toThrow(ValidationError);
      expect(() => parsePrice('Loading current price...')).toThrow(ValidationError);
      expect(() => parsePrice('N/A')).toThrow(ValidationError);
    });

    it('rejects $0.00 and negative prices', () => {
      expect(() => parsePrice('$0.00')).toThrow(ValidationError);
      expect(() => parsePrice('-15.00')).toThrow(ValidationError);
    });
  });

  describe('normalizeStock()', () => {
    it('normalizes valid stock strings and extracts quantities', () => {
      expect(normalizeStock('In Stock (12 left)')).toEqual({ status: 'in_stock', quantity: 12 });
      expect(normalizeStock('Only 3 left in stock')).toEqual({ status: 'low_stock', quantity: 3 });
      expect(normalizeStock('Out of stock')).toEqual({ status: 'out_of_stock', quantity: 0 });
    });

    it('throws ValidationError on unknown/garbage stock text', () => {
      expect(() => normalizeStock('Check back later maybe')).toThrow(ValidationError);
      expect(() => normalizeStock('random garbage text')).toThrow(ValidationError);
    });
  });

  describe('checkPriceSanity()', () => {
    it('flags > 5x price increases or > 80% price drops as suspect', () => {
      expect(checkPriceSanity(10, 12).isSuspect).toBe(false);
      expect(checkPriceSanity(60, 10).isSuspect).toBe(true); // 6x increase
      expect(checkPriceSanity(15, 100).isSuspect).toBe(true); // > 5x drop
    });
  });

  describe('withRetry() Helper', () => {
    it('retries on retryable errors and succeeds on subsequent attempt', async () => {
      let count = 0;
      const fn = async (attempt) => {
        count++;
        if (count === 1) {
          throw new ClickFailedError('Button obstructed');
        }
        return 'success_val';
      };

      const { result, attempts } = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
      expect(result).toBe('success_val');
      expect(attempts).toBe(2);
    });

    it('fails fast on non-retryable errors like StructureChangedError without exhausting maxAttempts', async () => {
      let count = 0;
      const fn = async () => {
        count++;
        throw new StructureChangedError('DOM missing price element');
      };

      await expect(withRetry(fn, { maxAttempts: 4, baseDelayMs: 10 })).rejects.toThrow(StructureChangedError);
      expect(count).toBe(1); // Non-retryable fails immediately
    });
  });

  describe('scrapeProduct() Core DB Invariants', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      // Mock browser module to avoid launching Chromium during mock DB invariant test
      vi.spyOn(browserModule, 'getBrowser').mockResolvedValue({});
      vi.spyOn(browserModule, 'createProductContext').mockResolvedValue({
        context: { close: vi.fn().mockResolvedValue() },
        page: {}
      });
    });

    it('NEVER writes to prices table on scrape failure, ONLY writes a scrape_logs row', async () => {
      const mockProduct = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        external_id: '767',
        url: 'https://demo.inelabteamdev.com/product/767'
      };

      const insertPriceSpy = vi.fn().mockResolvedValue({ error: null });
      const insertLogSpy = vi.fn().mockResolvedValue({ error: null });

      const mockSupabase = {
        from: vi.fn((tableName) => {
          if (tableName === 'prices') {
            return { insert: insertPriceSpy };
          }
          if (tableName === 'scrape_logs') {
            return { insert: insertLogSpy };
          }
          return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
        })
      };

      // Mock Supabase export
      vi.spyOn(supabaseConfig, 'supabase', 'get').mockReturnValue(mockSupabase);

      // Mock extractProductPage to throw StructureChangedError (non-retryable, fails fast)
      vi.spyOn(extractModule, 'extractProductPage').mockRejectedValue(
        new StructureChangedError('Mocked DOM element missing')
      );

      const res = await scrapeProduct(mockProduct);

      expect(res.success).toBe(false);
      expect(res.status).toBe('failed');

      // VERIFY DB INVARIANT: price_history table MUST NOT be inserted into on failure
      expect(insertPriceSpy).not.toHaveBeenCalled();

      // VERIFY DB INVARIANT: scrape_logs MUST be inserted into with status='failed'
      expect(insertLogSpy).toHaveBeenCalled();
      const logArg = insertLogSpy.mock.calls[0][0];
      expect(logArg.status).toBe('failed');
      expect(logArg.product_id).toBe(mockProduct.id);
      expect(logArg.error_message).toContain('STRUCTURE_CHANGED');
    });

    it('writes EXACTLY 1 price row and 1 scrape_logs row on scrape success', async () => {
      const mockProduct = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        external_id: '767',
        url: 'https://demo.inelabteamdev.com/product/767'
      };

      const insertPriceSpy = vi.fn().mockResolvedValue({ error: null });
      const insertLogSpy = vi.fn().mockResolvedValue({ error: null });
      const updateProductSpy = vi.fn().mockResolvedValue({ error: null });

      const mockSupabase = {
        from: vi.fn((tableName) => {
          if (tableName === 'price_history') {
            return { insert: insertPriceSpy };
          }
          if (tableName === 'scrape_logs') {
            return { insert: insertLogSpy };
          }
          return { update: () => ({ eq: updateProductSpy }) };
        })
      };

      vi.spyOn(supabaseConfig, 'supabase', 'get').mockReturnValue(mockSupabase);

      // Mock extractProductPage to succeed
      vi.spyOn(extractModule, 'extractProductPage').mockResolvedValue({
        rawPriceText: '$49.99',
        rawStockText: 'In Stock (10 left)',
        selectorUsed: '.price-success .pv-m4',
        blockState: 'success'
      });

      const res = await scrapeProduct(mockProduct);

      expect(res.success).toBe(true);
      expect(res.status).toBe('success');
      expect(res.price).toBe(49.99);

      // VERIFY DB INVARIANTS:
      expect(insertPriceSpy).toHaveBeenCalledTimes(1);
      expect(insertPriceSpy.mock.calls[0][0].price).toBe(49.99);
      expect(insertPriceSpy.mock.calls[0][0].stock_status).toBe('in_stock');

      expect(insertLogSpy).toHaveBeenCalledTimes(1);
      expect(insertLogSpy.mock.calls[0][0].status).toBe('success');

      expect(updateProductSpy).toHaveBeenCalledTimes(1);
    });
  });
});
