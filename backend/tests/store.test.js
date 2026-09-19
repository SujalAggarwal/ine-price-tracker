import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import { catalogCache } from '../src/store/catalogCache.js';
import { fetchCatalog, fetchProduct } from '../src/store/client.js';
import { StoreTimeoutError, StoreHttpError, StructureChangedError } from '../src/errors/errors.js';
import fs from 'fs';
import path from 'path';

// Load fixture JSONs
const fixturesDir = path.join(process.cwd(), 'fixtures');
const catalogFixture = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'catalog_page1_ok.json'), 'utf8').replace(/^\uFEFF/, '')
);
const productFixture = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'product_767_ok.json'), 'utf8').replace(/^\uFEFF/, '')
);

// Single page catalog fixture for fast mocking
const singlePageCatalogFixture = {
  ...catalogFixture,
  pages: 1
};

describe('Phase 2 - Product Search & Tracking API Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    catalogCache.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    catalogCache.reset();
  });

  describe('Store Client & Retries', () => {
    it('retries on 500 then succeeds on next attempt', async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(async (url) => {
        attempts++;
        if (attempts === 1) {
          return new Response(JSON.stringify({ error: 'Server error' }), {
            status: 500,
            statusText: 'Internal Server Error'
          });
        }
        return new Response(JSON.stringify(productFixture), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application.json' }
        });
      });

      const product = await fetchProduct(767);
      expect(attempts).toBe(2);
      expect(product.storeProductId).toBe('767');
      expect(product.name).toBe('Domus Cable Kit X');
    });

    it('throws StoreTimeoutError on request timeout', async () => {
      global.fetch = vi.fn().mockImplementation(async (url, options) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      });

      await expect(fetchProduct(767)).rejects.toThrow(StoreTimeoutError);
    });

    it('throws StructureChangedError when store response violates schema', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ invalid: 'data' }), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application.json' }
        })
      );

      await expect(fetchProduct(767)).rejects.toThrow(StructureChangedError);
    });
  });

  describe('Catalog Cache & Stale-While-Error', () => {
    it('serves cached catalog on store failure if cache exists', async () => {
      // 1. Initial successful catalog fetch
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(singlePageCatalogFixture), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application.json' }
        })
      );

      const catalog1 = await catalogCache.getCatalog();
      expect(catalog1.length).toBe(20);

      // Force cache expiration
      catalogCache.lastFetchedAt = 0;

      // 2. Store breaks (500 Error)
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Store down' }), {
          status: 500,
          statusText: 'Internal Server Error'
        })
      );

      // Should return stale cached catalog without throwing
      const catalog2 = await catalogCache.getCatalog();
      expect(catalog2.length).toBe(20);
      expect(catalog2[0].name).toBe(catalog1[0].name);
    });

    it('throws 502 store error when catalog fetch fails and no cache exists', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Store down' }), {
          status: 502,
          statusText: 'Bad Gateway'
        })
      );

      const res = await supertest(app).get('/api/store/search?q=test');
      expect(res.status).toBe(502);
      expect(res.body.error).toBe('Store Gateway Error');
    });
  });

  describe('Search API Endpoints (GET /api/store/search)', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(singlePageCatalogFixture), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application.json' }
        })
      );
    });

    it('returns first N items when search query q is empty', async () => {
      const res = await supertest(app).get('/api/store/search?limit=5');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(5);
      expect(res.body.results[0]).toHaveProperty('storeProductId');
      expect(res.body.results[0]).toHaveProperty('name');
      expect(res.body.results[0]).not.toHaveProperty('price');
    });

    it('filters products by case-insensitive partial match on name/brand/category', async () => {
      const res = await supertest(app).get('/api/store/search?q=Vantablack');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results.every((r) => r.brand === 'Vantablack')).toBe(true);
    });

    it('returns 400 for invalid query parameters (e.g. limit < 1 or limit > 100)', async () => {
      const res = await supertest(app).get('/api/store/search?limit=999');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });

  describe('Product Tracking Routes & Validation', () => {
    it('returns 400 for invalid UUID on PATCH and DELETE', async () => {
      const resPatch = await supertest(app)
        .patch('/api/products/invalid-uuid')
        .send({ is_active: false });

      expect(resPatch.status).toBe(400);
      expect(resPatch.body.error).toBe('Validation Error');

      const resDelete = await supertest(app).delete('/api/products/123-not-uuid');
      expect(resDelete.status).toBe(400);
      expect(resDelete.body.error).toBe('Validation Error');
    });

    it('returns 400 when scrape_interval_minutes is less than 30', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const res = await supertest(app)
        .patch(`/api/products/${validUuid}`)
        .send({ scrape_interval_minutes: 15 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });
});
