import { ChevronDown, ChevronUp, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type {
  OCCConflictRecord,
  OCCConflictHistoryResponse,
} from '../../hooks/useOCC';

import {
  formatTimestamp,
  getOutcomeMessage,
  getErrorType,
} from '../../utils/occUtils';

import OCCStatusBadge from './OCCStatusBadge';

interface Props {
  conflicts: OCCConflictRecord[];
  limit: number;
  setLimit: React.Dispatch<React.SetStateAction<number>>;
  occHistory: UseQueryResult<OCCConflictHistoryResponse, Error>;

  onExplainError: (record: OCCConflictRecord) => void;
}

export default function OCCConflictTable({
  conflicts,
  limit,
  setLimit,
  occHistory,
  onExplainError,
}: Props)  {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert size={14} className="text-rose-500" />
            OCC Conflict Log
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Real rows from{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              raw.occ_conflict_log
            </span>
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Limit
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 transition"
          >
            {[5, 10, 20, 50].map((option) => (
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
            <RefreshCw
              size={16}
              className={occHistory.isFetching ? 'animate-spin' : ''}
            />
          </button>
        </div>
      </div>

      {/* Table / Empty State View */}
      {conflicts.length === 0 && !occHistory.isLoading ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm text-slate-500 dark:text-slate-400">
          No OCC records yet. Run the demo to generate a conflict pair and
          populate this panel.
        </div>
      ) : (
        <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#0b0f17] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-4 py-3">Writer</th>
                <th className="px-4 py-3">Attempted At</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Error Type</th>
                <th className="px-4 py-3">Message</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#111827]">
              {conflicts.map((record, index) => {
                const rowId = `${record.writer_id}-${record.attempted_at}-${index}`;
                const expanded = expandedRows.has(rowId);

                return (
                  <tr key={rowId} className="align-top">
                    {/* Writer Column */}
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      Writer {record.writer_id}
                    </td>

                    {/* Timestamp Column */}
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {formatTimestamp(record.attempted_at)}
                    </td>

                    {/* Status Badge Column */}
                    <td className="px-4 py-3">
                      <OCCStatusBadge outcome={record.outcome} />
                    </td>

                    {/* Error Type Column */}
                    <td
                      className={`px-4 py-3 ${
                        record.outcome === 'committed'
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {getErrorType(record.outcome, record.error_type)}
                    </td>

                    {/* Expandable Message / Stack Trace Column */}
                    <td className="px-4 py-3 max-w-md align-top">
                      <div
                        className={`whitespace-pre-line ${
                          record.outcome === 'committed'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {getOutcomeMessage(record.outcome, record.error_message)}
                      </div>

                      {record.outcome === 'conflict_failed' && record.error_message && (
                        <>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button
                              onClick={() => onExplainError(record)}
                              className="inline-flex items-center gap-2 rounded-lg border border-[#226b4d]/30 bg-[#226b4d]/10 px-3 py-2 text-xs font-semibold text-[#226b4d] transition hover:bg-[#226b4d]/20 dark:border-[#3b8c69]/40 dark:bg-[#226b4d]/20 dark:text-emerald-300"
                            >
                              <Sparkles size={14} />
                              Explain with Copilot
                            </button>

                            <button
                              onClick={() => toggleRow(rowId)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                              {expanded ? (
                                <>
                                  <ChevronUp size={14} />
                                  Hide Technical Details
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={14} />
                                  Show Technical Details
                                </>
                              )}
                            </button>
                          </div>

                          {expanded && (
                            <>
                              <hr className="my-3 border-slate-200 dark:border-slate-800" />

                              <pre className="rounded-lg bg-slate-100 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-700 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300 standard-mono">
                                {record.error_message}
                              </pre>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};