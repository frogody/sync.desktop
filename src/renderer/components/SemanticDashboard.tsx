/**
 * Semantic Dashboard
 *
 * Shows semantic pipeline data: work context, threads, entities,
 * activity distribution, and behavioral signatures.
 * Three tabs: Overview | Threads | Patterns
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

type Tab = 'overview' | 'threads' | 'patterns';

const TAB_LIST: Tab[] = ['overview', 'threads', 'patterns'];

function formatActivityType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function formatMetricName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface WorkContext {
  currentThread: any;
  currentIntent: any;
  recentEntities: any[];
  activityDistribution: any[];
  signatures: any[];
}

interface SemanticDashboardProps {
  onBack: () => void;
}

const ACTIVITY_COLORS: Record<string, string> = {
  BUILDING: 'bg-sync-teal',
  INVESTIGATING: 'bg-sync-cyan',
  COMMUNICATING: 'bg-cyan-500',
  ORGANIZING: 'bg-amber-500',
  OPERATING: 'bg-green-500',
  CONTEXT_SWITCHING: 'bg-zinc-500',
};

const ACTIVITY_TEXT_COLORS: Record<string, string> = {
  BUILDING: 'text-sync-teal-light',
  INVESTIGATING: 'text-sync-cyan',
  COMMUNICATING: 'text-cyan-400',
  ORGANIZING: 'text-amber-400',
  OPERATING: 'text-green-400',
  CONTEXT_SWITCHING: 'text-zinc-400',
};

const TREND_ARROWS: Record<string, string> = {
  improving: '\u2191',
  declining: '\u2193',
  stable: '\u2192',
};

const TREND_COLORS: Record<string, string> = {
  improving: 'text-green-400',
  declining: 'text-red-400',
  stable: 'text-zinc-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  rhythm: 'Rhythm',
  workflow: 'Workflow',
  quality: 'Quality',
  collaboration: 'Collaboration',
  tool: 'Tool Usage',
  stress: 'Stress',
};

const HIGHLIGHT_METRICS = new Set([
  'deep_work_ratio',
  'peak_hours',
  'context_switch_rate',
  'meeting_load',
]);

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatMetricValue(value: any): string {
  if (typeof value === 'number') {
    if (value < 1 && value > 0) return `${Math.round(value * 100)}%`;
    return String(Math.round(value * 10) / 10);
  }
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) return value.join(', ');
    if (value.value !== undefined) return formatMetricValue(value.value);
    return JSON.stringify(value);
  }
  return String(value ?? '-');
}

export default function SemanticDashboard({ onBack }: SemanticDashboardProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [workContext, setWorkContext] = useState<WorkContext | null>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [ctxResult, threadsResult, sigsResult] = await Promise.all([
        window.electron.getWorkContext(),
        window.electron.getSemanticThreads(),
        window.electron.getBehavioralSignatures(),
      ]);

      if (ctxResult.success && ctxResult.data) setWorkContext(ctxResult.data);
      if (threadsResult.success && threadsResult.data) setThreads(threadsResult.data);
      if (sigsResult.success && sigsResult.data) setSignatures(sigsResult.data);
    } catch (error) {
      console.error('[Dashboard] fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const hasData = workContext && (
    workContext.currentThread ||
    workContext.recentEntities.length > 0 ||
    workContext.activityDistribution.length > 0
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900/95">
      {/* Header */}
      <div className="drag-region flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back to chat"
            className="no-drag p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="font-semibold text-white text-sm">Work Insights</h1>
            <p className="text-xs text-zinc-400">Activity Patterns</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-white/10 px-4"
        role="tablist"
        aria-label="Dashboard tabs"
        onKeyDown={(e) => {
          const currentIndex = TAB_LIST.indexOf(tab);
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = TAB_LIST[(currentIndex + 1) % TAB_LIST.length];
            setTab(next);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = TAB_LIST[(currentIndex - 1 + TAB_LIST.length) % TAB_LIST.length];
            setTab(prev);
          }
        }}
      >
        {TAB_LIST.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`tabpanel-${t}`}
            id={`tab-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none ${
              tab === t
                ? 'text-cyan-400 border-cyan-400'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3"
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : !hasData ? (
          <EmptyState />
        ) : (
          <>
            {tab === 'overview' && <OverviewTab workContext={workContext!} />}
            {tab === 'threads' && <ThreadsTab threads={threads} />}
            {tab === 'patterns' && <PatternsTab signatures={signatures} />}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <h2 className="text-sm font-medium text-zinc-300 mb-1">No data yet</h2>
      <p className="text-xs text-zinc-500 max-w-[220px]">
        Keep working and SYNC will learn your patterns. Data appears after the first analysis cycle.
      </p>
    </div>
  );
}

function OverviewTab({ workContext }: { workContext: WorkContext }) {
  const { currentThread, currentIntent, recentEntities, activityDistribution } = workContext;

  return (
    <>
      {/* Work Context Card */}
      <div className="bg-zinc-800/50 rounded-xl p-3 border border-white/5">
        <h2 className="text-xs font-medium text-zinc-400 mb-2">Current Work</h2>
        {currentThread ? (
          <div className="space-y-2">
            <p className="text-sm text-white font-medium">
              {currentThread.title || 'Untitled Thread'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {currentIntent && (
                <span className="px-2 py-0.5 bg-sync-teal/20 text-sync-teal-light text-[10px] rounded-full">
                  {currentIntent.intentType}
                  {currentIntent.intentSubtype ? ` / ${currentIntent.intentSubtype}` : ''}
                </span>
              )}
              {currentThread.primaryActivityType && (
                <span className={`px-2 py-0.5 bg-sync-cyan/20 text-sync-cyan text-[10px] rounded-full`}>
                  {formatActivityType(currentThread.primaryActivityType)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No active thread detected — keep working and one will appear automatically</p>
        )}
      </div>

      {/* Entity Pills */}
      {recentEntities.length > 0 && (
        <div className="bg-zinc-800/50 rounded-xl p-3 border border-white/5">
          <h2 className="text-xs font-medium text-zinc-400 mb-2">Recent Entities</h2>
          <div className="flex flex-wrap gap-1.5">
            {recentEntities.slice(0, 8).map((entity: any) => (
              <span
                key={entity.entityId}
                className="px-2 py-0.5 bg-cyan-500/10 text-cyan-300 text-[10px] rounded-full border border-cyan-500/20"
                title={`${entity.type} (${entity.occurrenceCount}x)`}
              >
                {entity.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Activity Distribution */}
      {activityDistribution.length > 0 && (
        <div className="bg-zinc-800/50 rounded-xl p-3 border border-white/5">
          <h2 className="text-xs font-medium text-zinc-400 mb-2">Activity Distribution (24h)</h2>
          <div className="space-y-2">
            {activityDistribution.map((item: any) => (
              <div key={item.type} className="flex items-center gap-2">
                <span className={`text-[10px] w-28 truncate ${ACTIVITY_TEXT_COLORS[item.type] || 'text-zinc-400'}`}>
                  {formatActivityType(item.type)}
                </span>
                <div
                  className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden"
                  role="meter"
                  aria-label={`${formatActivityType(item.type)}: ${Math.round(item.percentage)}%`}
                  aria-valuenow={Math.round(item.percentage)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full ${ACTIVITY_COLORS[item.type] || 'bg-zinc-500'}`}
                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500 w-10 text-right">
                  {Math.round(item.percentage)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ThreadsTab({ threads }: { threads: any[] }) {
  if (threads.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-zinc-400">No active work threads</p>
        <p className="text-[10px] text-zinc-500 mt-1">Threads represent your ongoing tasks and appear automatically as you work</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((thread: any) => (
        <div
          key={thread.threadId}
          className="bg-zinc-800/50 rounded-xl p-3 border border-white/5"
        >
          <div className="flex items-start justify-between mb-1.5">
            <p className="text-sm text-white font-medium flex-1 mr-2">
              {thread.title || 'Untitled Thread'}
            </p>
            <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
              thread.status === 'active'
                ? 'bg-green-500/20 text-green-300'
                : 'bg-zinc-600/20 text-zinc-400'
            }`}>
              {thread.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span>{thread.eventCount} events</span>
            <span>{timeAgo(thread.startedAt)}</span>
            {thread.primaryActivityType && (
              <span className={ACTIVITY_TEXT_COLORS[thread.primaryActivityType] || 'text-zinc-400'}>
                {formatActivityType(thread.primaryActivityType)}
              </span>
            )}
          </div>
          {thread.primaryEntities && thread.primaryEntities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {thread.primaryEntities.slice(0, 4).map((e: any, i: number) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-zinc-700/50 text-zinc-400 text-[10px] rounded"
                >
                  {typeof e === 'string' ? e : e.name || e.entityId}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PatternsTab({ signatures }: { signatures: any[] }) {
  if (signatures.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-zinc-500">No work patterns detected yet</p>
        <p className="text-[10px] text-zinc-600 mt-1">Patterns appear after a few days of activity tracking</p>
      </div>
    );
  }

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const sig of signatures) {
    if (!grouped[sig.category]) grouped[sig.category] = [];
    grouped[sig.category].push(sig);
  }

  // Sort highlight metrics to top within each category
  for (const cat in grouped) {
    grouped[cat].sort((a: any, b: any) => {
      const aHighlight = HIGHLIGHT_METRICS.has(a.metricName) ? 0 : 1;
      const bHighlight = HIGHLIGHT_METRICS.has(b.metricName) ? 0 : 1;
      return aHighlight - bHighlight;
    });
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([category, sigs]) => (
        <div key={category} className="bg-zinc-800/50 rounded-xl p-3 border border-white/5">
          <h2 className="text-xs font-medium text-zinc-400 mb-2">
            {CATEGORY_LABELS[category] || category}
          </h2>
          <div className="space-y-1.5">
            {sigs.map((sig: any) => {
              const isHighlight = HIGHLIGHT_METRICS.has(sig.metricName);
              return (
                <div
                  key={sig.signatureId || `${sig.category}-${sig.metricName}`}
                  className={`flex items-center justify-between py-1 ${
                    isHighlight ? 'px-2 -mx-2 bg-white/[0.03] rounded-lg' : ''
                  }`}
                >
                  <span className="text-[11px] text-zinc-300">
                    {formatMetricName(sig.metricName)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white font-medium">
                      {formatMetricValue(sig.currentValue)}
                    </span>
                    <span className={`text-xs ${TREND_COLORS[sig.trend] || 'text-zinc-400'}`}>
                      {TREND_ARROWS[sig.trend] || ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
