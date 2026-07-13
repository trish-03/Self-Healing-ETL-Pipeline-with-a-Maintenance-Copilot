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

  return (
    <div className="space-y-6">
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Recorded Attempts
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {occHistory.isLoading ? '...' : metrics.total}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Successful Commits
          </span>
          <span className="text-2xl font-black text-emerald-500 dark:text-emerald-400 tracking-tight">
            {occHistory.isLoading ? '...' : metrics.committed}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Detected Conflicts
          </span>
          <span className="text-2xl font-black text-amber-500 dark:text-amber-400 tracking-tight">
            {occHistory.isLoading ? '...' : metrics.failed}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Conflict Rate
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {occHistory.isLoading ? '...' : `${metrics.conflictRate}%`}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Writers Observed
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {occHistory.isLoading ? '...' : metrics.uniqueWriters}
          </span>
        </div>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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