import type { HealthHistoryEntry } from '../hooks/useTableHealth';

export interface ChartPoint {
  batch: string;
  live_files: number;
  snapshot_count: number;
  event_type: string;
}

/**
 * Converts raw health-check history rows into chart-ready points.
 * Includes maintenance before/after rows so the trend line shows
 * real compaction drops instead of hiding them.
 */
export function transformHealthHistory(history: HealthHistoryEntry[] | undefined): ChartPoint[] {
  return (history ?? [])
    .slice(-90)
    .map((h) => ({
      batch: `${new Date(h.checked_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })} · ${h.event_type.replace('_', ' ')}`,
      live_files: h.live_file_count ?? 0,
      snapshot_count: h.snapshot_count ?? 0,
      event_type: h.event_type,
    }));
}