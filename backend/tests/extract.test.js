import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractProductPage } from '../src/scraper/extract.js';
import { getBrowser, createProductContext } from '../src/scraper/browser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getFixture(name) {
  return fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf-8');
}

describe('Phase 3 - Scraper Extract Tests', () => {
  let browser;

  beforeAll(async () => {
    browser = await getBrowser();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  async function setupMockPage(fixtureName, layoutClasses = { priceValue: 'pv-m4', stock: 'st-m4' }) {
    const { context, page } = await createProductContext(browser);
    
    // Serve local fixtures
    await page.unroute('**/*'); // remove default browser.js blocking for this test
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('/product/test-id')) {
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: getFixture(fixtureName)
        });
      } else if (url.includes('/api/layout')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ classes: layoutClasses })
        });
      } else {
        route.abort();
      }
    });

    return { context, page };
  }

  it('extracts price successfully from Success fixture', async () => {
    const { context, page } = await setupMockPage('extract_success.html');
    try {
      const result = await extractProductPage(page, 'http://localhost/product/test-id');
      expect(result.blockState).toBe('success');
      expect(result.rawPriceText).toContain('3,013.00');
      expect(result.rawStockText).toContain('12 left');
    } finally {
      await context.close();
    }
  });

  it('handles Loading fixture', async () => {
    const { context, page } = await setupMockPage('extract_loading.html');
    try {
      // It should timeout waiting for success or error state
      await expect(extractProductPage(page, 'http://localhost/product/test-id')).rejects.toThrow();
    } finally {
      await context.close();
    }
  }, 20000);

  it('handles Error fixture', async () => {
    const { context, page } = await setupMockPage('extract_error.html');
    try {
      // It should throw BlockErrorState
      await expect(extractProductPage(page, 'http://localhost/product/test-id')).rejects.toThrow('error state');
    } finally {
      await context.close();
    }
  }, 20000);

  it('handles Hidden traps fixture by ignoring hidden elements', async () => {
    const { context, page } = await setupMockPage('extract_hidden.html');
    try {
      const result = await extractProductPage(page, 'http://localhost/product/test-id');
      expect(result.blockState).toBe('success');
      expect(result.rawPriceText).toContain('3,013.00');
      // Should not contain the hidden price
      expect(result.rawPriceText).not.toContain('hidden');
    } finally {
      await context.close();
    }
  });

  it('handles Missing elements fixture', async () => {
    const { context, page } = await setupMockPage('extract_missing.html');
    try {
      // Should throw StructureChangedError
      await expect(extractProductPage(page, 'http://localhost/product/test-id')).rejects.toThrow('not loaded');
    } finally {
      await context.close();
    }
  }, 20000);
});
