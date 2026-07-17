import { useMemo, useState } from 'react';

import {
  useOCCConflictHistory,
  useRunOCC,
} from '../../hooks/useOCC';
import type { OCCConflictRecord } from '../../hooks/useOCC';

import OCCRunCard from './OCCRunCard';
import OCCRecentSignals from './OCCRecentSignals';
import OCCConflictTable from './OCCConflictTable';

interface OCCControlProps {
  onExplainError: (record: OCCConflictRecord) => void;
}

export default function OCCControl({ onExplainError }: OCCControlProps) {
  const [limit, setLimit] = useState(5);

  const occHistory = useOCCConflictHistory(limit);
  const runOCC = useRunOCC();

  const conflicts = occHistory.data?.conflicts ?? [];

  const metrics = useMemo(() => {
    const committed = conflicts.filter(
      (record) => record.outcome === 'committed'
    ).length;

    const failed = conflicts.filter(
      (record) => record.outcome === 'conflict_failed'
    ).length;

    const uniqueWriters = new Set(
      conflicts.map((record) => record.writer_id)
    ).size;

    const lastAttempt = conflicts[0];

    const errorTypes = conflicts.reduce<Record<string, number>>(
      (accumulator, record) => {
        if (!record.error_type) return accumulator;

        accumulator[record.error_type] =
          (accumulator[record.error_type] ?? 0) + 1;

        return accumulator;
      },
      {}
    );

    return {
      total: occHistory.data?.count ?? 0,
      committed,
      failed,
      conflictRate:
        conflicts.length > 0
          ? Math.round((failed / conflicts.length) * 100)
          : 0,
      uniqueWriters,
      lastAttempt,
      errorTypes,
    };
  }, [conflicts, occHistory.data?.count]);

  const statItems = [
    { label: 'Recorded Attempts', value: metrics.total, color: '' },
    { label: 'Successful Commits', value: metrics.committed, color: 'text-emerald-500 dark:text-emerald-400' },
    { label: 'Detected Conflicts', value: metrics.failed, color: 'text-amber-500 dark:text-amber-400' },
    { label: 'Conflict Rate', value: `${metrics.conflictRate}%`, color: '' },
    { label: 'Writers Observed', value: metrics.uniqueWriters, color: '' },
  ];

  return (
    <div className="space-y-5">
      {/* Unified stat strip */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-100 dark:divide-slate-800">
          {statItems.map(({ label, value, color }) => (
            <div key={label} className="px-5 py-4 flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                {label}
              </span>
              <span className={`text-2xl font-black tracking-tight mt-0.5 ${color || 'text-slate-900 dark:text-white'}`}>
                {occHistory.isLoading ? '—' : value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Run card + Recent Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <OCCRunCard runOCC={runOCC} />

        <OCCRecentSignals
          metrics={{
            lastAttempt: metrics.lastAttempt,
            errorTypes: metrics.errorTypes,
          }}
          isFetching={occHistory.isFetching}
        />
      </div>

      {/* Conflict History */}
      <OCCConflictTable
        conflicts={conflicts}
        limit={limit}
        setLimit={setLimit}
        occHistory={occHistory}
        onExplainError={onExplainError}
      />
    </div>
  );
}