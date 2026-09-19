import React, { useState, useEffect } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHealth(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Health check failed:', err);
        setHealth({ status: 'error', error: err.message });
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              INE
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Price Tracker
            </h1>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Phase 1 Scaffold
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center items-center">
        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Project Scaffold Ready</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Phase 1 foundation established with React (Vite), Express Node.js, and Supabase PostgreSQL schema.
            </p>
          </div>

          {/* Backend Connection Card */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <span className="text-sm font-medium text-slate-300">Backend API Health</span>
              {loading ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Checking...
                </span>
              ) : health?.status === 'ok' ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ● Healthy
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  ● Offline / Unreachable
                </span>
              )}
            </div>

            {health && (
              <pre className="bg-slate-900 p-4 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto border border-slate-800">
                {JSON.stringify(health, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        INE Product Price Tracker &copy; 2026. Internship Assignment - Phase 1.
      </footer>
    </div>
  );
}
