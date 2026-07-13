import { AlertTriangle, CheckCircle2, PlayCircle } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { OCCRunResponse } from '../../hooks/useOCC';

interface Props {
  runOCC: UseMutationResult<OCCRunResponse, Error, void, unknown>;
}

export default function OCCRunCard({ runOCC }: Props) {
  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm uppercase tracking-wide">
        <PlayCircle size={16} className="text-[#226b4d]" />
        Run OCC Demo
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Launches two concurrent writers against{' '}
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          fact_inventory
        </span>{' '}
        and refreshes the history after completion.
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
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">
                Writers Launched
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {runOCC.data.summary.writers_launched}
              </span>
            </div>

            <div>
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">
                OCC Detected
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {runOCC.data.summary.occ_detected ? 'Yes' : 'No'}
              </span>
            </div>

            <div>
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">
                Successful Commits
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {runOCC.data.summary.successful_commits}
              </span>
            </div>

            <div>
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">
                Failed Commits
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {runOCC.data.summary.failed_commits}
              </span>
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
  );
}