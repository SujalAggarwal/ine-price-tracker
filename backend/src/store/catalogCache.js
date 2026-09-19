import { fetchCatalog } from './client.js';

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

class CatalogCache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.cachedCatalog = null;
    this.lastFetchedAt = 0;
    this.inflightRefresh = null;
  }

  /**
   * Returns true if cache is present and within TTL.
   */
  isFresh() {
    return (
      this.cachedCatalog !== null &&
      Date.now() - this.lastFetchedAt < this.ttlMs
    );
  }

  /**
   * Fetches full catalog or serves from cache.
   * Handles stale-while-error and prevents duplicate concurrent refreshes.
   */
  async getCatalog() {
    // 1. If fresh cache exists, return immediately
    if (this.isFresh()) {
      return this.cachedCatalog;
    }

    // 2. If a refresh is already in progress, await the inflight promise
    if (this.inflightRefresh) {
      try {
        return await this.inflightRefresh;
      } catch (err) {
        // If inflight fails but we have stale cache, serve it
        if (this.cachedCatalog !== null) {
          console.warn('[CatalogCache Warning] Inflight refresh failed; serving stale cache:', err.message);
          return this.cachedCatalog;
        }
        throw err;
      }
    }

    // 3. Initiate single refresh promise
    this.inflightRefresh = (async () => {
      try {
        const catalog = await fetchCatalog();
        this.cachedCatalog = catalog;
        this.lastFetchedAt = Date.now();
        return catalog;
      } catch (err) {
        // Stale-while-error fallback
        if (this.cachedCatalog !== null) {
          console.warn('[CatalogCache Warning] Refresh failed; serving stale cache:', err.message);
          return this.cachedCatalog;
        }
        throw err;
      } finally {
        this.inflightRefresh = null;
      }
    })();

    return await this.inflightRefresh;
  }

  /**
   * Resets cache state (useful for tests).
   */
  reset() {
    this.cachedCatalog = null;
    this.lastFetchedAt = 0;
    this.inflightRefresh = null;
  }
}

export const catalogCache = new CatalogCache();
export { CatalogCache };
