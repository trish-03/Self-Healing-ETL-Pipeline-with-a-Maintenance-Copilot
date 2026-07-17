import {
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
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

type LegendEntry = {
  dataKey?: string;
  value?: string;
  color?: string;
};

export default function DashboardOverview({
  health,
  isLoading,
  chartData,
}: DashboardOverviewProps) {
  const [activeSeries, setActiveSeries] = useState<"both" | "live_files" | "snapshot_count">("both");

  const legendEntries: LegendEntry[] = [
    { dataKey: "live_files", value: "File Count", color: "#6366f1" },
    {
      dataKey: "snapshot_count",
      value: "Snapshot Count",
      color: "#f87171",
    },
  ];

  const renderLegend = () => (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-[10px] font-medium">
      {legendEntries.map((entry) => {
        const isActive = activeSeries === "both" || activeSeries === entry.dataKey;

        return (
          <button
            key={entry.dataKey}
            type="button"
            aria-pressed={isActive}
            onClick={() => {
              if (activeSeries === entry.dataKey) {
                setActiveSeries("both");
                return;
              }

              setActiveSeries(entry.dataKey as "live_files" | "snapshot_count");
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
              isActive
                ? "border-slate-300/80 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                : "border-slate-200 dark:border-slate-800 bg-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.value}</span>
          </button>
        );
      })}
    </div>
  );

  const statusColor =
    health?.status === "FRAGMENTED"
      ? "text-amber-500"
      : health?.status === "UNKNOWN"
      ? "text-slate-400"
      : "text-emerald-500";

  return (
    <div className="space-y-5">
      {/* Unified stat strip — no individual boxes */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-100 dark:divide-slate-800">
          {/* Status */}
          <div className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Table State
            </span>
            <span className={`text-sm font-extrabold flex items-center gap-1.5 mt-1 ${statusColor}`}>
              {isLoading ? "Reading..." : health?.status}
              {!isLoading &&
                (health?.status === "FRAGMENTED" ? (
                  <AlertTriangle size={14} className="shrink-0" />
                ) : health?.status === "UNKNOWN" ? (
                  <AlertTriangle size={14} className="shrink-0 opacity-50" />
                ) : (
                  <CheckCircle2 size={14} className="shrink-0" />
                ))}
            </span>
          </div>

          {/* Live Parquet Blocks */}
          <div className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Live Parquet Blocks
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
              {isLoading ? "—" : health?.metrics.live_file_count}
            </span>
          </div>

          {/* Snapshot Count */}
          <div className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Snapshot Count
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
              {isLoading ? "—" : health?.metrics.snapshot_count}
            </span>
          </div>

          {/* Avg File Size */}
          <div className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Avg File Size
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
              {isLoading
                ? "—"
                : `${(
                    (health?.metrics.average_file_size_bytes ?? 0) / 1024
                  ).toFixed(2)} KB`}
            </span>
          </div>

          {/* Delete Files */}
          <div className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Delete Files
            </span>
            <span
              className={`text-2xl font-black tracking-tight mt-0.5 ${
                health?.metrics.delete_file_count &&
                health.metrics.delete_file_count > 0
                  ? "text-red-500 dark:text-red-400"
                  : "text-slate-400"
              }`}
            >
              {isLoading ? "—" : health?.metrics.delete_file_count}
            </span>
          </div>
        </div>
      </div>

      {/* Chart panel */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 h-96 rounded-xl p-6 flex flex-col">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Small-File &amp; Snapshot Accumulation Trend
            </h3>
          </div>
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

                <Legend
                  verticalAlign="top"
                  align="right"
                  content={renderLegend}
                />

                <Area
                  type="linear"
                  dataKey="live_files"
                  name="File Count"
                  stroke="#6366f1"
                  fillOpacity={1}
                  fill="url(#colorLive)"
                  strokeWidth={2}
                  hide={activeSeries !== "both" && activeSeries !== "live_files"}
                />

                <Area
                  type="linear"
                  dataKey="snapshot_count"
                  name="Snapshot Count"
                  stroke="#f87171"
                  fillOpacity={1}
                  fill="url(#colorSnapshots)"
                  strokeWidth={2}
                  hide={activeSeries !== "both" && activeSeries !== "snapshot_count"}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}