/**
 * 1. Delete fake test product rows (CASCADE deletes price_history + scrape_logs)
 * 2. Track 3 real products via fetchProduct + upsert
 */
import { supabase } from './src/config/supabase.js';
import { fetchProduct } from './src/store/client.js';

// Step 1: Check if stock_status column exists
console.log('=== Step 1: Checking stock_status column ===');
const { data: testRow, error: testErr } = await supabase
  .from('price_history')
  .select('stock_status')
  .limit(1);

if (testErr && testErr.message.includes('stock_status')) {
  console.log('stock_status column does NOT exist in price_history.');
  console.log('Please run this in Supabase SQL Editor:');
  console.log(`
    ALTER TABLE price_history 
    ADD COLUMN IF NOT EXISTS stock_status VARCHAR(20) 
    CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock'));
  `);
  process.exit(1);
} else {
  console.log('stock_status column: OK');
}

// Step 2: Delete all fake test product rows
console.log('\n=== Step 2: Deleting fake test products ===');
const { data: deleted, error: delErr } = await supabase
  .from('products')
  .delete()
  .in('external_id', ['1', '2', '767'])
  .select('id, external_id, name');

if (delErr) {
  console.error('Delete failed:', delErr.message);
} else {
  console.log('Deleted products (CASCADE removes price_history + scrape_logs):');
  console.table(deleted);
}

// Verify tables are clean
const { count: pCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
const { count: phCount } = await supabase.from('price_history').select('*', { count: 'exact', head: true });
const { count: slCount } = await supabase.from('scrape_logs').select('*', { count: 'exact', head: true });
console.log('\nRemaining rows:');
console.log('  products:', pCount);
console.log('  price_history:', phCount);
console.log('  scrape_logs:', slCount);

// Step 3: Track 3 real products via fetchProduct + upsert
console.log('\n=== Step 3: Tracking 3 real products from store API ===');
const storeIds = ['1', '2', '767'];

for (const storeId of storeIds) {
  console.log(`\n  Fetching /api/product/${storeId} from store...`);
  try {
    const detail = await fetchProduct(storeId);
    console.log(`  Got: "${detail.name}" (${detail.brand || 'no brand'})`);

    const payload = {
      external_id: String(detail.storeProductId),
      name: detail.name,
      slug: detail.slug,
      brand: detail.brand,
      category: detail.category,
      sku: detail.sku,
      url: detail.url,
      image_url: detail.imageUrl,
      metadata: {
        description: detail.description,
        specs: detail.specs,
        reviewCount: detail.reviews?.length || 0
      }
    };

    const { data, error } = await supabase
      .from('products')
      .upsert(payload, { onConflict: 'external_id' })
      .select()
      .single();

    if (error) {
      console.error(`  Upsert failed for ${storeId}:`, error.message);
    } else {
      console.log(`  Tracked: ${data.name} (id: ${data.id})`);
    }
  } catch (err) {
    console.error(`  Failed to fetch product ${storeId}:`, err.message);
  }
}

// Show final products table
console.log('\n=== Final products table ===');
const { data: finalProducts } = await supabase
  .from('products')
  .select('id, external_id, name, brand, category, url, image_url, is_active, scrape_interval_minutes')
  .order('external_id');

console.table(finalProducts?.map(p => ({
  id: p.id.slice(0, 12) + '...',
  external_id: p.external_id,
  name: p.name,
  brand: p.brand || '-',
  category: p.category || '-',
  has_image: p.image_url ? 'yes' : 'no',
  is_active: p.is_active,
  interval: p.scrape_interval_minutes
})));

process.exit(0);
