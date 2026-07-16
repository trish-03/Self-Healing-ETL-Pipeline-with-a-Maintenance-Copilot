import { RefreshCw, Users } from 'lucide-react';
import type { OCCConflictRecord } from '../../hooks/useOCC';
import { formatTimestamp } from '../../utils/occUtils';

interface Metrics {
  lastAttempt?: OCCConflictRecord;
  errorTypes: Record<string, number>;
}

interface Props {
  metrics: Metrics;
  isFetching: boolean;
}

export default function OCCRecentSignals({ metrics, isFetching }: Props) {
  const signalRows = [
    {
      label: 'Last Attempt',
      value: metrics.lastAttempt
        ? formatTimestamp(metrics.lastAttempt.attempted_at)
        : 'No attempts recorded',
    },
    {
      label: 'Failure Type Breakdown',
      value:
        Object.keys(metrics.errorTypes).length > 0
          ? Object.entries(metrics.errorTypes)
              .map(([name, count]) => `${name}: ${count}`)
              .join(', ')
          : 'No failure types recorded',
    },
    {
      label: 'Live Refresh',
      value: isFetching ? 'Syncing latest OCC rows...' : 'Auto-refreshes every 30s',
      icon: isFetching ? <RefreshCw size={11} className="animate-spin inline mr-1 opacity-60" /> : null,
    },
  ];

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
        <Users size={15} className="text-indigo-500" />
        Recent Signals
      </div>

      {/* Signal rows — no inner boxes, just dividers */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {signalRows.map(({ label, value, icon }) => (
          <div key={label} className="px-6 py-3.5 flex items-start justify-between gap-4">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase shrink-0 mt-0.5">
              {label}
            </span>
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 text-right">
              {icon}
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}