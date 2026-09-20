import React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

export default function ScrapeLogModal({ isOpen, onClose, product }) {
  if (!isOpen) return null;

  const logs = product.scrape_logs || [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>
      
      {/* Modal content */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-background border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">Scrape Logs</h2>
            <p className="text-sm text-textMain/70 mt-1">{product.name}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-textMain/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Body - Logs Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-textMain/60">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No scrape logs recorded yet.</p>
              <p className="text-sm">Logs will appear here after the first scheduled scrape.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="glass-panel p-4 rounded-xl border border-white/5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {log.status === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-rose-400" />
                      )}
                      <span className={`font-semibold capitalize ${
                        log.status === 'success' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <span className="text-xs text-textMain/60 whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                    <div>
                      <p className="text-[10px] text-textMain/50 uppercase tracking-wider mb-1">Response Time</p>
                      <p className="text-white font-mono">{log.response_time_ms ? `${log.response_time_ms}ms` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-textMain/50 uppercase tracking-wider mb-1">HTTP Status</p>
                      <p className="text-white font-mono">{log.http_status || '-'}</p>
                    </div>
                  </div>
                  
                  {log.error_message && (
                    <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                      <p className="text-xs text-rose-300 font-mono break-words">
                        {log.error_message}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
