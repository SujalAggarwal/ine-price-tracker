import React from 'react';
import { formatCurrency, timeAgo } from '../utils/formatters';
import { Package, Clock, ExternalLink, Activity } from 'lucide-react';

// Simple SVG sparkline component
function Sparkline({ data }) {
  if (!data || data.length < 2) return <div className="h-10 opacity-30 flex items-center text-xs">Not enough data</div>;
  
  // data is array of { price } ordered descending by date (latest first). We need chronological order.
  const chronological = [...data].reverse();
  const prices = chronological.map(d => Number(d.price));
  
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1; // avoid div by 0
  
  const width = 100;
  const height = 40;
  
  const points = prices.map((price, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((price - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const isUp = prices[prices.length - 1] > prices[0];
  const strokeColor = isUp ? '#ef4444' : '#10b981'; // Red for price increase, green for decrease

  return (
    <svg viewBox={`0 -5 ${width} ${height + 10}`} className="w-full h-12 drop-shadow-md overflow-visible">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function ProductCard({ product, onViewLogs }) {
  const latestPrice = product.price_history?.[0];
  const priceValue = latestPrice?.price;
  const stockStatus = latestPrice?.stock_status || 'unknown';
  const currency = latestPrice?.currency || 'INR';
  
  const statusColors = {
    in_stock: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    low_stock: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    out_of_stock: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
    unknown: 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  };

  const statusLabels = {
    in_stock: 'In Stock',
    low_stock: 'Low Stock',
    out_of_stock: 'Out of Stock',
    unknown: 'Unknown'
  };

  return (
    <div className="glass-panel rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-primary/5 group relative overflow-hidden">
      {/* Decorative gradient blob */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors"></div>
      
      <div className="relative z-10 flex gap-4">
        {/* Product Image */}
        <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center p-2">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain drop-shadow-lg" />
          ) : (
            <Package className="w-8 h-8 text-white/20" />
          )}
        </div>
        
        {/* Details */}
        <div className="flex-1 min-w-0 pr-8 relative">
          <h3 className="font-semibold text-lg text-white truncate mb-1" title={product.name}>
            {product.name}
          </h3>
          
          {/* External Link */}
          <a 
            href={product.url} 
            target="_blank" 
            rel="noreferrer"
            className="absolute top-0 right-0 p-1 text-white/30 hover:text-white/80 transition-colors"
            title="View on store"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2.5 py-1 rounded-md border font-medium ${statusColors[stockStatus]}`}>
              {statusLabels[stockStatus]} {latestPrice?.stock > 0 && `(${latestPrice.stock})`}
            </span>
          </div>
          
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white tracking-tight">
              {formatCurrency(priceValue, currency)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Footer / Sparkline */}
      <div className="mt-6 pt-4 border-t border-white/10 flex items-end justify-between gap-4">
        <div className="flex-1">
          <p className="text-[10px] text-textMain/50 mb-1 uppercase tracking-wider font-semibold">Price Trend</p>
          <Sparkline data={product.price_history} />
        </div>
        
        <div className="text-right shrink-0 flex flex-col items-end">
          <p className="text-[10px] text-textMain/50 mb-1 uppercase tracking-wider font-semibold">Last Checked</p>
          <div className="flex items-center gap-1.5 text-xs text-textMain mb-2">
            <Clock className="w-3.5 h-3.5" />
            {timeAgo(product.last_scraped_at)}
          </div>
          
          <button 
            onClick={onViewLogs}
            className="flex items-center gap-1.5 text-[10px] font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white py-1 px-2.5 rounded border border-white/10 transition-colors"
          >
            <Activity className="w-3 h-3" />
            VIEW LOGS
          </button>
        </div>
      </div>
    </div>
  );
}
