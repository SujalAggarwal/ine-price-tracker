import { z } from 'zod';
import dotenv from 'dotenv';
import {
  StoreTimeoutError,
  StoreHttpError,
  StoreNetworkError,
  StructureChangedError
} from '../errors/errors.js';

dotenv.config();

const DEFAULT_STORE_BASE_URL = 'https://demo.inelabteamdev.com';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const POLITE_PAGE_DELAY_MS = 50;

// Zod validation schemas for store API responses
const CatalogItemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  slug: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable()
});

const CatalogPageSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  pages: z.number(),
  total: z.number(),
  items: z.array(CatalogItemSchema)
});

const ProductDetailSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  slug: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  specs: z.record(z.any()).optional().nullable(),
  reviews: z.array(z.any()).optional().nullable()
});

function getStoreBaseUrl() {
  return process.env.STORE_BASE_URL || DEFAULT_STORE_BASE_URL;
}

/**
 * Calculates exponential backoff delay with random jitter.
 */
function getBackoffDelay(attempt) {
  const baseDelay = 300 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 100);
  return baseDelay + jitter;
}

/**
 * Helper to pause execution for polite page delays and retries.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core fetch function with 10s timeout, retries, and typed errors.
 */
async function fetchWithRetry(url, options = {}) {
  const baseUrl = getStoreBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  let attempt = 0;
  let lastError = null;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(fullUrl, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application.json',
          ...(options.headers || {})
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const httpError = new StoreHttpError(response.status, response.statusText);
        
        // 429 and 5xx are retryable. 4xx (except 429) are NOT retryable.
        if (response.status === 429 || response.status >= 500) {
          lastError = httpError;
          if (attempt < MAX_RETRIES) {
            await sleep(getBackoffDelay(attempt));
            attempt++;
            continue;
          }
        }
        throw httpError;
      }

      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new StructureChangedError(`Invalid JSON received from ${fullUrl}: ${err.message}`);
      }

      return json;

    } catch (err) {
      clearTimeout(timeoutId);

      // Already handled StoreHttpError for non-retryable 4xx
      if (err instanceof StoreHttpError && (err.statusCode < 500 && err.statusCode !== 429)) {
        throw err;
      }
      if (err instanceof StructureChangedError) {
        throw err;
      }

      // Handle AbortError / Timeout
      if (err.name === 'AbortError') {
        lastError = new StoreTimeoutError(`Request to ${fullUrl} timed out after ${timeoutMs}ms`);
      } else if (err instanceof StoreHttpError) {
        lastError = err;
      } else {
        lastError = new StoreNetworkError(`Fetch failed for ${fullUrl}: ${err.message}`);
      }

      if (attempt < MAX_RETRIES) {
        await sleep(getBackoffDelay(attempt));
        attempt++;
      } else {
        throw lastError;
      }
    }
  }

  throw lastError;
}

/**
 * Normalizes item data into unified shape.
 */
function normalizeItem(item) {
  const baseUrl = getStoreBaseUrl();
  const storeProductId = String(item.id);
  return {
    storeProductId,
    name: item.name,
    slug: item.slug || null,
    brand: item.brand || null,
    category: item.category || null,
    sku: item.sku || null,
    description: item.description || null,
    imageUrl: item.imageUrl || null,
    url: `${baseUrl}/product/${storeProductId}`
  };
}

/**
 * Fetches all catalog pages politely and normalizes products.
 */
export async function fetchCatalog() {
  const firstPageData = await fetchWithRetry('/api/catalog?page=1&pageSize=20');
  
  const parsedFirstPage = CatalogPageSchema.safeParse(firstPageData);
  if (!parsedFirstPage.success) {
    throw new StructureChangedError(`Catalog page 1 schema invalid: ${parsedFirstPage.error.message}`);
  }

  const totalPages = parsedFirstPage.data.pages;
  const allItems = [...parsedFirstPage.data.items];

  // Fetch remaining pages sequentially with polite delay
  for (let page = 2; page <= totalPages; page++) {
    await sleep(POLITE_PAGE_DELAY_MS);
    const pageData = await fetchWithRetry(`/api/catalog?page=${page}&pageSize=20`);
    const parsedPage = CatalogPageSchema.safeParse(pageData);
    if (!parsedPage.success) {
      throw new StructureChangedError(`Catalog page ${page} schema invalid: ${parsedPage.error.message}`);
    }
    allItems.push(...parsedPage.data.items);
  }

  return allItems.map(normalizeItem);
}

/**
 * Fetches product detail for a single product ID.
 */
export async function fetchProduct(id) {
  const rawData = await fetchWithRetry(`/api/product/${id}`);
  
  const parsed = ProductDetailSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new StructureChangedError(`Product detail schema invalid for ID ${id}: ${parsed.error.message}`);
  }

  const normalized = normalizeItem(parsed.data);
  return {
    ...normalized,
    specs: parsed.data.specs || {},
    reviews: parsed.data.reviews || []
  };
}

export { fetchWithRetry };
