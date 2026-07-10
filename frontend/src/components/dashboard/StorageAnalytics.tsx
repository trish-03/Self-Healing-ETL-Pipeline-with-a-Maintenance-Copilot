import { Database, FileStack, FileWarning, Layers } from 'lucide-react';
import type { TableHealthResponse } from '../../hooks/useTableHealth';
import type { HealthHistoryEntry } from '../../hooks/useTableHealth';
import MaintenanceHistoryPanel from './MaintenanceHistoryPanel';

interface StorageAnalyticsProps {
  activeTable: string;
  health: TableHealthResponse | undefined;
  history: HealthHistoryEntry[] | undefined;
}

export default function StorageAnalytics({ activeTable, health, history }: StorageAnalyticsProps) {
  const metrics = health?.metrics;

  const rows = [
    {
      icon: <Layers size={14} className="text-indigo-500" />,
      label: 'Live Data Files',
      value: metrics?.live_file_count,
      note: 'Files currently referenced by the latest snapshot',
    },
    {
      icon: <FileStack size={14} className="text-slate-400" />,
      label: 'Physical Files on Disk',
      value: metrics?.physical_file_count,
      note: 'Includes files from expired/unexpired snapshots',
    },
    {
      icon: <FileWarning size={14} className="text-amber-500" />,
      label: 'Orphan Files',
      value: metrics?.orphan_file_count,
      note: 'Files not referenced by any snapshot manifest',
    },
    {
      icon: <Database size={14} className="text-emerald-500" />,
      label: 'Manifest Files',
      value: metrics?.manifest_count,
      note: 'Manifest files tracking data file locations',
    },
    {
      icon: <Database size={14} className="text-emerald-400" />,
      label: 'Metadata JSON Versions',
      value: metrics?.metadata_json_count,
      note: 'Versioned table metadata snapshots',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm mb-1">
          <Database size={16} className="text-indigo-500 dark:text-indigo-400" />
          <span>File Manifest Breakdown: {activeTable}</span>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
          Live counts from the Iceberg catalog -- not aggregated or cached.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 p-3"
            >
              <div className="flex items-start gap-2 min-w-0">
                {row.icon}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{row.label}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{row.note}</p>
                </div>
              </div>
              <span className="text-sm font-black text-slate-900 dark:text-white shrink-0">
                {row.value ?? '--'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl text-xs space-y-3">
        <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Layout & Write Mode
        </h3>
        <MaintenanceHistoryPanel history={history} />
        <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
          <li>Logical Model Definition: Unpartitioned Append Target Mode</li>
          <li>
            Average Payload Block Size:{' '}
            {((metrics?.average_file_size_bytes ?? 0) / 1024).toFixed(2)} KB
          </li>
          <li>
           Storage Structure Mode: Merge-on-Read (MoR)
          </li>
        </ul>
      </div>
    </div>
  );
}