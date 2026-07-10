import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface TableMetrics {
  live_file_count: number;
  physical_file_count: number;
  average_file_size_bytes: number;
  delete_file_count: number;
  snapshot_count: number;
  manifest_count: number;
  metadata_json_count: number;
  orphan_file_count: number;
}

export interface TableHealthResponse {
  table_name: string;
  status: 'HEALTHY' | 'FRAGMENTED' | 'UNKNOWN';
  metrics: TableMetrics;
}

export interface HealthHistoryEntry {
  checked_at: string;
  live_file_count: number | null;
  physical_file_count: number | null;
  average_file_size_bytes: number | null;
  delete_file_count: number | null;
  snapshot_count: number | null;
  manifest_count: number | null;
  metadata_json_count: number | null;
  orphan_file_count: number | null;
  event_type: string;
}

export interface HealthHistoryResponse {
  table_name: string;
  history: HealthHistoryEntry[];
}

export function useTableHealth(tableName: string) {
  return useQuery<TableHealthResponse>({
    queryKey: ['tableHealth', tableName],
    queryFn: async () => {
      const { data } = await api.get('/health', { params: { table: tableName } });
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useTableHealthHistory(tableName: string, limit: number = 250) {
  return useQuery<HealthHistoryResponse>({
    queryKey: ['tableHealthHistory', tableName],
    queryFn: async () => {
      const { data } = await api.get('/health/history', {
        params: { table: tableName, limit },
      });
      return data;
    },
    refetchInterval: 30000,
  });
}