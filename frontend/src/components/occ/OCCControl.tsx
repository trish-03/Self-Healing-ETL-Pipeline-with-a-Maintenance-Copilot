import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PlayCircle, RefreshCw, ShieldAlert, Users } from 'lucide-react';

import { useOCCConflictHistory, useRunOCC } from '../../hooks/useOCC';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OCCControl() {
  const [limit, setLimit] = useState(20);
  const occHistory = useOCCConflictHistory(limit);
  const runOCC = useRunOCC();

  const conflicts = occHistory.data?.conflicts ?? [];

  const metrics = useMemo(() => {
    const committed = conflicts.filter((record) => record.outcome === 'committed').length;
    const failed = conflicts.filter((record) => record.outcome === 'conflict_failed').length;
    const uniqueWriters = new Set(conflicts.map((record) => record.writer_id)).size;
    const lastAttempt = conflicts[0];
    const errorTypes = conflicts.reduce<Record<string, number>>((accumulator, record) => {
      if (!record.error_type) return accumulator;
      accumulator[record.error_type] = (accumulator[record.error_type] ?? 0) + 1;
      return accumulator;
    }, {});

    return {
      total: occHistory.data?.count ?? 0,
      committed,
      failed,
      conflictRate: conflicts.length > 0 ? Math.round((failed / conflicts.length) * 100) : 0,
      uniqueWriters,
      lastAttempt,
      errorTypes,
    };
  }, [conflicts, occHistory.data?.count]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Recorded Attempts</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {occHistory.isLoading ? '...' : metrics.total}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Successful Commits</span>
          <span className="text-2xl font-black text-emerald-500 dark:text-emerald-400 tracking-tight">
            {occHistory.isLoading ? '...' : metrics.committed}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Detected Conflicts</span>
          <span className="text-2xl font-black text-amber-500 dark:text-amber-400 tracking-tight">
            {occHistory.isLoading ? '...' : metrics.failed}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Conflict Rate</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {occHistory.isLoading ? '...' : `${metrics.conflictRate}%`}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Writers Observed</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {occHistory.isLoading ? '...' : metrics.uniqueWriters}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert size={14} className="text-rose-500" />
                OCC Conflict Log
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Real rows from <span className="font-semibold text-slate-600 dark:text-slate-300">raw.occ_conflict_log</span>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Limit
              </label>
              <select
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 transition"
              >
                {[10, 20, 50].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <button
                onClick={() => occHistory.refetch()}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Refresh OCC history"
              >
                <RefreshCw size={16} className={occHistory.isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {conflicts.length === 0 && !occHistory.isLoading ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm text-slate-500 dark:text-slate-400">
              No OCC records yet. Run the demo to generate a conflict pair and populate this panel.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#0b0f17] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3">Writer</th>
                    <th className="px-4 py-3">Attempted At</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Error Type</th>
                    <th className="px-4 py-3">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#111827]">
                  {conflicts.map((record, index) => (
                    <tr key={`${record.writer_id}-${record.attempted_at}-${index}`} className="align-top">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">Writer {record.writer_id}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatTimestamp(record.attempted_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                            record.outcome === 'committed'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-amber-500/10 text-amber-500'
                          }`}
                        >
                          {record.outcome === 'committed' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                          {record.outcome.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{record.error_type ?? 'None'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[24rem] whitespace-pre-line break-words">
                        {record.error_message ?? 'No error message recorded.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm uppercase tracking-wide">
              <PlayCircle size={16} className="text-[#226b4d]" />
              Run OCC Demo
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Launches two concurrent writers against <span className="font-semibold text-slate-600 dark:text-slate-300">fact_inventory</span> and refreshes the history after completion.
            </p>

            <button
              onClick={() => runOCC.mutate()}
              disabled={runOCC.isPending}
              className="bg-[#226b4d] hover:bg-[#2d7a59] disabled:opacity-50 text-white text-xs font-bold py-2.5 px-5 rounded-md flex items-center gap-2 shadow-md transition"
            >
              <PlayCircle size={16} />
              {runOCC.isPending ? 'Running OCC demo...' : 'Run OCC Demo'}
            </button>

            {runOCC.isSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                  <CheckCircle2 size={16} />
                  OCC Demo Complete
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Writers Launched</span>
                    <span className="font-bold text-slate-900 dark:text-white">{runOCC.data.summary.writers_launched}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Occ Detected</span>
                    <span className="font-bold text-slate-900 dark:text-white">{runOCC.data.summary.occ_detected ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Successful Commits</span>
                    <span className="font-bold text-slate-900 dark:text-white">{runOCC.data.summary.successful_commits}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Failed Commits</span>
                    <span className="font-bold text-slate-900 dark:text-white">{runOCC.data.summary.failed_commits}</span>
                  </div>
                </div>
              </div>
            )}

            {runOCC.isError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-2 text-red-500 text-xs">
                <AlertTriangle size={16} />
                OCC demo failed: {runOCC.error.message}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm uppercase tracking-wide">
              <Users size={16} className="text-indigo-500" />
              Recent Signals
            </div>

            <div className="grid grid-cols-1 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 p-3">
                <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Last Attempt</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {metrics.lastAttempt ? formatTimestamp(metrics.lastAttempt.attempted_at) : 'No attempts recorded'}
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 p-3">
                <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Failure Type Breakdown</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {Object.keys(metrics.errorTypes).length > 0
                    ? Object.entries(metrics.errorTypes).map(([name, count]) => `${name}: ${count}`).join(', ')
                    : 'No failure types recorded'}
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 p-3">
                <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Live Refresh</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {occHistory.isFetching ? 'Syncing latest OCC rows...' : 'Auto-refreshes every 30s'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}