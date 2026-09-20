import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import Header from './components/Header';
import ProductCard from './components/ProductCard';
import SearchModal from './components/SearchModal';
import EmptyState from './components/EmptyState';
import ScrapeLogModal from './components/ScrapeLogModal';
import { fetchProducts } from './utils/api';

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedLogProduct, setSelectedLogProduct] = useState(null);

  const loadProducts = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      setError(null);
      const data = await fetchProducts();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Error loading products:', err);
      setError(err.message || 'Failed to fetch tracked products');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleProductTracked = (newProduct) => {
    // Add or refresh products list
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === newProduct.id);
      if (exists) return prev;
      return [newProduct, ...prev];
    });
    // Trigger fresh reload in background to get latest snapshots
    loadProducts();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-textMain selection:bg-primary selection:text-background relative">
      {/* Background glowing gradients */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse" />
      <div className="fixed bottom-10 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Header */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/5">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Tracked Courses & Certifications
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {products.length} {products.length === 1 ? 'item' : 'items'}
              </span>
            </h2>
            <p className="text-sm text-textMain/70 mt-1">
              Automated price extraction & historical trend tracking powered by Supabase & Puppeteer.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadProducts(true)}
              disabled={refreshing || loading}
              className="p-2.5 rounded-xl glass-panel border border-white/10 text-textMain hover:text-white hover:border-white/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              title="Refresh product list"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-primary' : ''}`} />
            </button>

            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-background font-semibold hover:bg-opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20 cursor-pointer text-sm"
            >
              <Plus className="w-4 h-4" />
              Track New Product
            </button>
          </div>
        </div>

        {/* Content State Handling */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 rounded-2xl bg-surface/50 border border-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="glass-panel border-rose-500/20 bg-rose-500/5 rounded-2xl p-6 text-center max-w-md mx-auto my-12">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h4 className="text-white font-medium mb-1">Error Connecting to Backend</h4>
            <p className="text-rose-200/70 text-sm mb-4">{error}</p>
            <button
              onClick={() => loadProducts(true)}
              className="px-4 py-2 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg transition"
            >
              Try Again
            </button>
          </div>
        ) : products.length === 0 ? (
          <EmptyState onOpenSearch={() => setIsSearchOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
            {products.map((product) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                onViewLogs={() => setSelectedLogProduct(product)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center text-xs text-textMain/50">
        INE Price Tracker &bull; Powered by Express, Puppeteer & Supabase &bull; 2026
      </footer>

      {/* Search & Track Modal */}
      {isSearchOpen && (
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onTrackSuccess={handleProductTracked}
        />
      )}

      {/* Scrape Log Modal - single global instance */}
      <ScrapeLogModal
        isOpen={!!selectedLogProduct}
        onClose={() => setSelectedLogProduct(null)}
        product={selectedLogProduct || {}}
      />
    </div>
  );
}
