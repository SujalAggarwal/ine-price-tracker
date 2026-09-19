import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Loader2, X, AlertCircle } from 'lucide-react';
import { searchStore, trackProduct } from '../utils/api';
import { formatCurrency } from '../utils/formatters';

export default function SearchModal({ isOpen, onClose, onProductAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [trackingId, setTrackingId] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      
      setIsSearching(true);
      setError(null);
      try {
        const data = await searchStore(query);
        setResults(data.products || []);
      } catch (err) {
        setError('Failed to search products');
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const handleTrack = async (productId) => {
    setTrackingId(productId);
    setError(null);
    try {
      await trackProduct(productId);
      onProductAdded();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to track product');
    } finally {
      setTrackingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl glass-panel rounded-2xl overflow-hidden shadow-2xl animate-slide-up border border-white/10">
        {/* Search Input Area */}
        <div className="flex items-center px-6 py-4 border-b border-white/10 bg-surface/80">
          <Search className="w-5 h-5 text-textMain/50 mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search mock store products (e.g. iPhone, Watch)..."
            className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder:text-textMain/30"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-textMain" />
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="px-6 py-3 bg-rose-500/10 border-b border-rose-500/20 flex items-center gap-2 text-rose-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <div className="py-2">
              {results.map((product) => (
                <div key={product.id} className="flex items-center gap-4 px-6 py-3 hover:bg-white/5 transition-colors group">
                  <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center p-1 overflow-hidden shrink-0">
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium truncate">{product.name}</h4>
                    <p className="text-textMain/70 text-sm">{formatCurrency(product.price)}</p>
                  </div>
                  
                  <button
                    onClick={() => handleTrack(product.id)}
                    disabled={trackingId === product.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {trackingId === product.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> Track
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : query ? (
            <div className="py-12 text-center text-textMain/50">
              No products found matching "{query}"
            </div>
          ) : (
            <div className="py-12 text-center text-textMain/50 text-sm">
              Start typing to search products...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
