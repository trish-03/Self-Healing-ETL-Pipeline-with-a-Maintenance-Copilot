import { AlertTriangle, CheckCircle2, PlayCircle } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { OCCRunResponse } from '../../hooks/useOCC';

interface Props {
  runOCC: UseMutationResult<OCCRunResponse, Error, void, unknown>;
}

export default function OCCRunCard({ runOCC }: Props) {
  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
          <PlayCircle size={15} className="text-[#226b4d]" />
          Run OCC Demo
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          Launches two concurrent writers against{' '}
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            fact_inventory
          </span>{' '}
          and refreshes the history after completion.
        </p>
      </div>

      {/* Action area */}
      <div className="px-6 py-4">
        <button
          onClick={() => runOCC.mutate()}
          disabled={runOCC.isPending}
          className="bg-[#226b4d] hover:bg-[#2d7a59] disabled:opacity-50 text-white text-xs font-bold py-2.5 px-5 rounded-md flex items-center gap-2 shadow-md transition"
        >
          <PlayCircle size={16} />
          {runOCC.isPending ? 'Running OCC demo...' : 'Run OCC Demo'}
        </button>
      </div>

      {/* Success result */}
      {runOCC.isSuccess && (
        <div className="border-t border-emerald-500/20 bg-emerald-500/5">
          <div className="px-6 py-2.5 flex items-center gap-2 text-emerald-500 font-bold text-xs border-b border-emerald-500/10">
            <CheckCircle2 size={13} />
            OCC Demo Complete
          </div>
          <div className="grid grid-cols-2 divide-x divide-emerald-500/10">
            {[
              { label: 'Writers Launched', value: runOCC.data.summary.writers_launched },
              { label: 'OCC Detected', value: runOCC.data.summary.occ_detected ? 'Yes' : 'No' },
              { label: 'Successful Commits', value: runOCC.data.summary.successful_commits },
              { label: 'Failed Commits', value: runOCC.data.summary.failed_commits },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3">
                <span className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  {label}
                </span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {runOCC.isError && (
        <div className="border-t border-red-500/20 px-6 py-4 flex items-center gap-2 text-red-500 text-xs bg-red-500/5">
          <AlertTriangle size={15} className="shrink-0" />
          OCC demo failed: {runOCC.error.message}
        </div>
      )}
    </div>
  );
}