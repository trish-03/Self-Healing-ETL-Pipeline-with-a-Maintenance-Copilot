import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000/api';

export interface HealthMetrics {
  snapshot_count: number;
  live_file_count: number;
  average_file_size_bytes: number;
}

export interface TableHealthResponse {
  table_name: string;
  status: 'HEALTHY' | 'FRAGMENTED';
  metrics: HealthMetrics;
}

export interface MaintenanceResponse {
  maintenance_executed: boolean;
  message: string;
  files_rewritten: number;
  files_deleted: number;
  before: HealthMetrics;
  after: HealthMetrics;
}

// Telemetry fetching hook
export function useTableHealth(tableName: string) {
  return useQuery<TableHealthResponse>({
    queryKey: ['tableHealth', tableName],
    queryFn: async () => {
      const { data } = await axios.post(`${API_BASE}/health`, { table_name: tableName });
      return data;
    },
    refetchInterval: 5000, // Pulls updates every 5 seconds so charts respond instantly to maintenance
  });
}

// Spark mutation engine hook
export function useExecuteMaintenance() {
  const queryClient = useQueryClient();

  return useMutation<MaintenanceResponse, Error, { tableName: string; confirmed: boolean }>({
    mutationFn: async ({ tableName, confirmed }) => {
      const { data } = await axios.post(`${API_BASE}/maintenance`, {
        table_name: tableName,
        confirmed,
      });
      return data;
    },
    // We grab the second argument 'variables' which holds the parameters sent to the mutation
    onSuccess: (_data, variables) => {
      // Invalidate query using the tableName passed into the mutation call
      queryClient.invalidateQueries({ queryKey: ['tableHealth', variables.tableName] });
    },
  });
}