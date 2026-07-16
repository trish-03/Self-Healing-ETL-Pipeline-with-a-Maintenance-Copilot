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
      icon: <Layers size={13} className="text-indigo-500 shrink-0 mt-0.5" />,
      label: 'Live Data Files',
      value: metrics?.live_file_count,
      note: 'Files currently referenced by the latest snapshot',
    },
    {
      icon: <FileStack size={13} className="text-slate-400 shrink-0 mt-0.5" />,
      label: 'Physical Files on Disk',
      value: metrics?.physical_file_count,
      note: 'Includes files from expired/unexpired snapshots',
    },
    {
      icon: <FileWarning size={13} className="text-amber-500 shrink-0 mt-0.5" />,
      label: 'Orphan Files',
      value: metrics?.orphan_file_count,
      note: 'Files not referenced by any snapshot manifest',
    },
    {
      icon: <Database size={13} className="text-emerald-500 shrink-0 mt-0.5" />,
      label: 'Manifest Files',
      value: metrics?.manifest_count,
      note: 'Manifest files tracking data file locations',
    },
    {
      icon: <Database size={13} className="text-emerald-400 shrink-0 mt-0.5" />,
      label: 'Metadata JSON Versions',
      value: metrics?.metadata_json_count,
      note: 'Versioned table metadata snapshots',
    },
  ];

  return (
    <div className="space-y-5">
      {/* File Manifest Breakdown */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Panel header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <Database size={15} className="text-indigo-500 dark:text-indigo-400" />
            File Manifest Breakdown: {activeTable}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Live counts from the Iceberg catalog — not aggregated or cached.
          </p>
        </div>

        {/* Metric rows — label + note on left, value right-aligned */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <div
              key={row.label}
              className="px-6 py-3.5 flex items-center gap-3"
            >
              {row.icon}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {row.label}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  {row.note}
                </p>
              </div>
              <span className="text-sm font-black text-slate-900 dark:text-white shrink-0">
                {row.value ?? '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Layout info footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0b0f17]/40">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2">
            Layout &amp; Write Mode
          </p>
          <ul className="space-y-1 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
            <li>Logical Model: Unpartitioned Append Target Mode</li>
            <li>
              Avg Payload Block Size:{' '}
              {((metrics?.average_file_size_bytes ?? 0) / 1024).toFixed(2)} KB
            </li>
            <li>Storage Structure: Merge-on-Read (MoR)</li>
          </ul>
        </div>
      </div>

      {/* Maintenance History */}
      <MaintenanceHistoryPanel history={history} />
    </div>
  );
}