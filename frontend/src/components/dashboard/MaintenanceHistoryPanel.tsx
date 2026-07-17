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
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
          <Wrench size={15} className="text-indigo-500 dark:text-indigo-400" />
          Maintenance History
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          Before/after comparisons from real maintenance_before / maintenance_after events.
        </p>
      </div>

      {pairs.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          No maintenance runs recorded yet for this table.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {pairs.map((pair) => {
            const deltas = computeDeltas(pair);
            return (
              <div key={pair.id} className="px-6 py-4">
                {/* Timestamp row */}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  <Clock size={11} />
                  {formatTimestamp(pair.before.checked_at)}
                  <ArrowRight size={11} />
                  {formatTimestamp(pair.after.checked_at)}
                </div>

                {/* Delta values — inline, no sub-cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
                  {deltas.map((delta) => (
                    <div key={delta.label} className="flex flex-col">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        {delta.label}
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                        {delta.before ?? '—'}
                        <ArrowRight size={9} className="inline mx-1 opacity-50" />
                        {delta.after ?? '—'}
                      </span>
                      {delta.change !== null && delta.change !== 0 && (
                        <span
                          className={`text-[10px] font-semibold ${
                            delta.change < 0 ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        >
                          {delta.change > 0 ? '+' : ''}
                          {delta.change}
                        </span>
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