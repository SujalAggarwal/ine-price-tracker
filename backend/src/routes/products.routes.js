import { Router } from 'express';
import { z } from 'zod';
import { catalogCache } from '../store/catalogCache.js';
import { fetchProduct } from '../store/client.js';
import { supabase } from '../config/supabase.js';
import {
  StoreTimeoutError,
  StoreHttpError,
  StoreNetworkError,
  StructureChangedError
} from '../errors/errors.js';

const router = Router();

// Validation Schemas
const SearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
});

const TrackProductSchema = z.object({
  storeProductId: z.union([z.string(), z.number()]).transform((val) => String(val))
});

const UuidParamSchema = z.object({
  id: z.string().uuid({ message: 'Invalid product ID format. Must be a valid UUID.' })
});

const PatchProductSchema = z.object({
  is_active: z.boolean().optional(),
  scrape_interval_minutes: z.number().int().min(30, { message: 'scrape_interval_minutes must be at least 30' }).optional()
}).refine((data) => data.is_active !== undefined || data.scrape_interval_minutes !== undefined, {
  message: 'At least one of is_active or scrape_interval_minutes must be provided'
});

/**
 * GET /api/store/search?q=<text>&limit=<n>
 * Search products in the store catalog (client-side matching).
 */
router.get('/store/search', async (req, res, next) => {
  try {
    const { q, limit } = SearchQuerySchema.parse(req.query);
    const catalog = await catalogCache.getCatalog();

    const searchTerm = q.trim().toLowerCase();
    let results = catalog;

    if (searchTerm) {
      results = catalog.filter((item) => {
        const nameMatch = item.name?.toLowerCase().includes(searchTerm);
        const brandMatch = item.brand?.toLowerCase().includes(searchTerm);
        const categoryMatch = item.category?.toLowerCase().includes(searchTerm);
        return nameMatch || brandMatch || categoryMatch;
      });
    }

    const slicedResults = results.slice(0, limit).map((item) => ({
      storeProductId: item.storeProductId,
      name: item.name,
      brand: item.brand,
      category: item.category,
      imageUrl: item.imageUrl,
      url: item.url
    }));

    res.json({ results: slicedResults });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products
 * Track a product by storeProductId. Fetches metadata and upserts into products table.
 */
router.post('/products', async (req, res, next) => {
  try {
    const { storeProductId } = TrackProductSchema.parse(req.body);
    const productDetail = await fetchProduct(storeProductId);

    // supabase.js throws on missing config, so supabase is always available

    const payload = {
      external_id: productDetail.storeProductId,
      name: productDetail.name,
      slug: productDetail.slug,
      brand: productDetail.brand,
      category: productDetail.category,
      sku: productDetail.sku,
      url: productDetail.url,
      image_url: productDetail.imageUrl,
      metadata: {
        description: productDetail.description,
        specs: productDetail.specs,
        reviewCount: productDetail.reviews?.length || 0
      },
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('products')
      .upsert(payload, { onConflict: 'external_id' })
      .select()
      .single();

    if (error) {
      console.error('[DB Upsert Error]:', error);
      return res.status(500).json({ error: 'Failed to track product in database', details: error.message });
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products
 * List tracked products with latest price_history row and latest scrape_logs status.
 */
router.get('/products', async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: 'Database connection unconfigured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.'
      });
    }

    const { data: products, error } = await supabase
      .from('products')
      .select(`
        *,
        price_history (
          id,
          price,
          mrp,
          currency,
          stock,
          stock_status,
          badge,
          captured_at
        ),
        scrape_logs (
          id,
          status,
          http_status,
          error_message,
          response_time_ms,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DB Fetch Error]:', error);
      return res.status(500).json({ error: 'Failed to fetch tracked products', details: error.message });
    }

    // Attach latest price row and latest scrape log status for each product
    const formattedProducts = (products || []).map((p) => {
      const sortedPrices = (p.price_history || []).sort(
        (a, b) => new Date(b.captured_at) - new Date(a.captured_at)
      );
      const sortedLogs = (p.scrape_logs || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      const { price_history, scrape_logs, ...productFields } = p;
      return {
        ...productFields,
        latest_price: sortedPrices[0] || null,
        latest_scrape_status: sortedLogs[0]?.status || null,
        latest_scrape_log: sortedLogs[0] || null
      };
    });

    res.json({ products: formattedProducts });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/products/:id
 * Update is_active and scrape_interval_minutes for a tracked product.
 */
router.patch('/products/:id', async (req, res, next) => {
  try {
    const { id } = UuidParamSchema.parse(req.params);
    const updates = PatchProductSchema.parse(req.body);

    if (!supabase) {
      return res.status(503).json({
        error: 'Database connection unconfigured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.'
      });
    }

    const { data, error } = await supabase
      .from('products')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Product with ID ${id} not found` });
      }
      console.error('[DB Patch Error]:', error);
      return res.status(500).json({ error: 'Failed to update product', details: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: `Product with ID ${id} not found` });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/products/:id
 * Remove a product from tracking.
 */
router.delete('/products/:id', async (req, res, next) => {
  try {
    const { id } = UuidParamSchema.parse(req.params);

    if (!supabase) {
      return res.status(503).json({
        error: 'Database connection unconfigured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.'
      });
    }

    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      console.error('[DB Delete Error]:', error);
      return res.status(500).json({ error: 'Failed to delete product', details: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: `Product with ID ${id} not found` });
    }

    res.json({ message: 'Product untracked successfully', id });
  } catch (err) {
    next(err);
  }
});

export default router;
