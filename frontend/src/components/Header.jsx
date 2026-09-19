import React, { useEffect, useState } from 'react';
import { Activity, Clock } from 'lucide-react';
import { fetchLatestRun } from '../utils/api';
import { timeAgo } from '../utils/formatters';

export default function Header() {
  const [latestRun, setLatestRun] = useState(null);

  useEffect(() => {
    fetchLatestRun()
      .then(data => setLatestRun(data.run))
      .catch(err => console.error('Failed to load latest run', err));
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/5 py-4 px-6 flex items-center justify-between animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Activity className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          INE <span className="text-gradient">Tracker</span>
        </h1>
      </div>

      <div className="flex items-center gap-4 text-sm font-medium">
        {latestRun ? (
          <div className="flex items-center gap-2 bg-surface px-4 py-2 rounded-full border border-white/5">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${latestRun.status === 'finished' ? 'bg-primary' : 'bg-yellow-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${latestRun.status === 'finished' ? 'bg-primary' : 'bg-yellow-500'}`}></span>
            </span>
            <span className="text-textMain/80 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 opacity-70" />
              Scraped {timeAgo(latestRun.started_at)}
            </span>
          </div>
        ) : (
          <div className="w-40 h-9 bg-surface animate-pulse rounded-full border border-white/5"></div>
        )}
      </div>
    </header>
  );
}
