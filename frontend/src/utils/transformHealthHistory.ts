import type { HealthHistoryEntry } from '../hooks/useTableHealth';

export interface ChartPoint {
  batch: string;
  live_files: number;
  snapshot_count: number;
}

/**
 * Converts raw health-check history rows into chart-ready points.
 * Filtered to plain health_check events (excludes maintenance
 * before/after pairs) so the trend line reflects organic growth,
 * not sawtooth artifacts from compaction runs.
 */
export function transformHealthHistory(history: HealthHistoryEntry[] | undefined): ChartPoint[] {
  return (history ?? [])
    .filter((h) => h.event_type === 'health_check')
    .slice(-90)
    .map((h) => ({
      batch: new Date(h.checked_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      live_files: h.live_file_count ?? 0,
      snapshot_count: h.snapshot_count ?? 0,
    }));
}