import React from 'react';
import { PackageSearch, Plus } from 'lucide-react';

export default function EmptyState({ onOpenSearch }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl glass-panel border border-white/5 my-8 max-w-lg mx-auto animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-6 shadow-inner border border-white/5">
        <PackageSearch className="w-8 h-8 text-primary" />
      </div>
      
      <h3 className="text-xl font-bold text-white mb-2">No tracked products yet</h3>
      <p className="text-textMain/70 text-sm max-w-sm mb-6">
        Start tracking courses and certifications to monitor daily price changes, price reveals, and historical sparklines.
      </p>

      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-background font-semibold hover:bg-opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        Track First Product
      </button>
    </div>
  );
}
