import {
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import type { TableHealthResponse } from '../../hooks/useTableHealth';

interface DashboardOverviewProps {
  health: TableHealthResponse | undefined;
  isLoading: boolean;
  chartData: {
    batch: string;
    live_files: number;
    snapshot_count: number;
    event_type: string;
  }[];
}

export default function DashboardOverview({
  health,
  isLoading,
  chartData,
}: DashboardOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl flex items-center justify-between overflow-hidden">
          <div className="min-w-0">
            <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
              Table State Status
            </span>

            <span
              className={`text-base font-extrabold flex items-center gap-1.5 whitespace-nowrap ${
                health?.status === "FRAGMENTED"
                  ? "text-amber-500"
                  : health?.status === "UNKNOWN"
                  ? "text-slate-400"
                  : "text-emerald-500"
              }`}
            >
              {isLoading ? "Reading..." : health?.status}

              {!isLoading &&
                (health?.status === "FRAGMENTED" ? (
                  <AlertTriangle size={16} className="shrink-0" />
                ) : health?.status === "UNKNOWN" ? (
                  <AlertTriangle size={16} className="shrink-0 opacity-50" />
                ) : (
                  <CheckCircle2 size={16} className="shrink-0" />
                ))}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Live Parquet Blocks
          </span>

          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isLoading ? "..." : health?.metrics.live_file_count}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Snapshot Count
          </span>

          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isLoading ? "..." : health?.metrics.snapshot_count}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Average File Size
          </span>

          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isLoading
              ? "..."
              : `${(
                  (health?.metrics.average_file_size_bytes ?? 0) / 1024
                ).toFixed(2)} KB`}
          </span>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">
            Delete Files
          </span>

          <span
            className={`text-2xl font-black tracking-tight ${
              health?.metrics.delete_file_count &&
              health.metrics.delete_file_count > 0
                ? "text-red-500 dark:text-red-400"
                : "text-slate-400"
            }`}
          >
            {isLoading ? "..." : health?.metrics.delete_file_count}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 h-96 rounded-xl p-6 flex flex-col">
        <div className="mb-4">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Small-File Frag & Snapshot Accumulation Trend
          </h3>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Real snapshot history from raw.table_health_history — health checks
            and maintenance snapshots included so compaction drops are visible.
          </p>
        </div>

        <div className="flex-1 w-full min-h-0">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs italic">
              No health history yet for this table — run a health check or
              maintenance pass to populate this chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="colorLive"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>

                  <linearGradient
                    id="colorSnapshots"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />

                <XAxis
                  dataKey="batch"
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                />

                <YAxis
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                />

                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: "#e2e8f0",
                  }}
                />

                <Area
                  type="linear"
                  dataKey="live_files"
                  name="Live Data Files"
                  stroke="#6366f1"
                  fillOpacity={1}
                  fill="url(#colorLive)"
                  strokeWidth={2}
                />

                <Area
                  type="linear"
                  dataKey="snapshot_count"
                  name="Snapshot Count"
                  stroke="#f87171"
                  fillOpacity={1}
                  fill="url(#colorSnapshots)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}