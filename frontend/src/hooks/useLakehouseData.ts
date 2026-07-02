import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api'; // Adjust to your FastAPI port

export interface TableMetrics {
  snapshot_count: number;
  live_file_count: number;
  delete_file_count: number;
  metadata_json_count: number;
  average_file_size_bytes: number;
  total_size_bytes: number;
}

export interface TableHealthResponse {
  table_name: string;
  status: 'HEALTHY' | 'FRAGMENTED' | 'DEGRADED';
  metrics: TableMetrics;
}

export interface MaintenanceResponse {
  table_name: string;
  files_rewritten: number;
  deletes_rewritten: number;
  files_deleted: number;
  before: TableMetrics;
  after: TableMetrics;
}

export interface OrphanRemovalResponse {
  table_name: string;
  orphans_removed: number;
  bytes_freed: number;
  status: string;
}

// Fetch point-in-time health metrics
export function useTableHealth(tableName: string) {
  return useQuery<TableHealthResponse>({
    queryKey: ['tableHealth', tableName],
    queryFn: async () => {
      // Passes ?table=fact_orders via query string parameters
      const { data } = await axios.get(`${API_BASE}/health`, { params: { table: tableName } });
      return data;
    },
    refetchInterval: 30000 
  });
}

// Invoke optimize / table compaction
export function useExecuteMaintenance() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceResponse, Error, { tableName: string; confirmed: boolean }>({
    mutationFn: async ({ tableName, confirmed }) => {
      const { data } = await axios.post(`${API_BASE}/maintenance`, { table: tableName, confirmed });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth', data.table_name] });
    }
  });
}

// Invoke orphan removal endpoint
export function useRemoveOrphans() {
  const queryClient = useQueryClient();
  return useMutation<OrphanRemovalResponse, Error, { tableName: string; confirmed: boolean }>({
    mutationFn: async ({ tableName, confirmed }) => {
      const { data } = await axios.post(`${API_BASE}/orphans`, { table: tableName, confirmed });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth', data.table_name] });
    }
  });
}