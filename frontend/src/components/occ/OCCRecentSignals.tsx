import { Users } from 'lucide-react';
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

export default function OCCRecentSignals({
  metrics,
  isFetching,
}: Props) {
  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3">
      <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm uppercase tracking-wide">
        <Users size={16} className="text-indigo-500" />
        Recent Signals
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs">
        <div className="rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 p-3">
          <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">
            Last Attempt
          </span>

          <span className="font-semibold text-slate-900 dark:text-white">
            {metrics.lastAttempt
              ? formatTimestamp(metrics.lastAttempt.attempted_at)
              : 'No attempts recorded'}
          </span>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 p-3">
          <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">
            Failure Type Breakdown
          </span>

          <span className="font-semibold text-slate-900 dark:text-white">
            {Object.keys(metrics.errorTypes).length > 0
              ? Object.entries(metrics.errorTypes)
                  .map(([name, count]) => `${name}: ${count}`)
                  .join(', ')
              : 'No failure types recorded'}
          </span>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 p-3">
          <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">
            Live Refresh
          </span>

          <span className="font-semibold text-slate-900 dark:text-white">
            {isFetching
              ? 'Syncing latest OCC rows...'
              : 'Auto-refreshes every 30s'}
          </span>
        </div>
      </div>
    </div>
  );
}