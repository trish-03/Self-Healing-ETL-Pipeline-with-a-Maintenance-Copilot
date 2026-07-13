import { ArrowRight, Clock, Wrench } from 'lucide-react';
import type { HealthHistoryEntry } from '../../hooks/useTableHealth';
import { pairMaintenanceEvents, computeDeltas } from '../../utils/pairMaintenanceEvents';


interface MaintenanceHistoryPanelProps {
  history: HealthHistoryEntry[] | undefined;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MaintenanceHistoryPanel({ history }: MaintenanceHistoryPanelProps) {
  const pairs = pairMaintenanceEvents(history);

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl">
      <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm mb-1">
        <Wrench size={16} className="text-indigo-500 dark:text-indigo-400" />
        <span>Maintenance History</span>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
        Before/after comparisons from real maintenance_before / maintenance_after events.
      </p>

      {pairs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm text-slate-500 dark:text-slate-400">
          No maintenance runs recorded yet for this table.
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map((pair) => {
            const deltas = computeDeltas(pair);
            return (
              <div
                key={pair.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <Clock size={12} />
                  {formatTimestamp(pair.before.checked_at)}
                  <ArrowRight size={12} />
                  {formatTimestamp(pair.after.checked_at)}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {deltas.map((delta) => (
                    <div key={delta.label} className="rounded-lg bg-slate-50 dark:bg-[#0b0f17] p-2.5">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        {delta.label}
                      </p>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {delta.before ?? '--'} <ArrowRight size={10} className="inline mx-0.5" />{' '}
                        {delta.after ?? '--'}
                      </p>
                      {delta.change !== null && delta.change !== 0 && (
                        <p
                          className={`text-[10px] font-semibold ${
                            delta.change < 0 ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        >
                          {delta.change > 0 ? '+' : ''}
                          {delta.change}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}