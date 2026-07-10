import type { HealthHistoryEntry } from '../hooks/useTableHealth';

export interface MaintenancePair {
  id: string;
  before: HealthHistoryEntry;
  after: HealthHistoryEntry;
}

interface MetricDelta {
  label: string;
  before: number | null;
  after: number | null;
  change: number | null;
}

/**
 * Walks the flat health history array and pairs up adjacent
 * maintenance_before -> maintenance_after rows for the same table.
 * Unpaired rows (e.g. a "before" whose "after" fell outside the
 * history LIMIT window) are silently dropped rather than crashing.
 */
export function pairMaintenanceEvents(history: HealthHistoryEntry[] | undefined): MaintenancePair[] {
  if (!history) return [];

  const pairs: MaintenancePair[] = [];
  let pendingBefore: HealthHistoryEntry | null = null;

  for (const entry of history) {
    if (entry.event_type === 'maintenance_before') {
      pendingBefore = entry;
    } else if (entry.event_type === 'maintenance_after' && pendingBefore) {
      pairs.push({
        id: `${pendingBefore.checked_at}-${entry.checked_at}`,
        before: pendingBefore,
        after: entry,
      });
      pendingBefore = null;
    }
  }

  // Most recent maintenance run first
  return pairs.reverse();
}

export function computeDeltas(pair: MaintenancePair): MetricDelta[] {
  const fields: { key: keyof HealthHistoryEntry; label: string }[] = [
    { key: 'live_file_count', label: 'Live Files' },
    { key: 'delete_file_count', label: 'Delete Files' },
    { key: 'snapshot_count', label: 'Snapshots' },
    { key: 'manifest_count', label: 'Manifests' },
  ];

  return fields.map(({ key, label }) => {
    const beforeVal = pair.before[key] as number | null;
    const afterVal = pair.after[key] as number | null;
    return {
      label,
      before: beforeVal,
      after: afterVal,
      change: beforeVal !== null && afterVal !== null ? afterVal - beforeVal : null,
    };
  });
}