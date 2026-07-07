import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

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
  status: 'HEALTHY' | 'FRAGMENTED';
  metrics: TableMetrics;
}

export interface MaintenanceResponse {
  maintenance_executed: boolean;
  message: string;
  files_rewritten: number;
  deletes_rewritten: number;
  files_deleted: number;
  before: TableMetrics;
  after: TableMetrics;
}

export interface OrphanRemovalResponse {
  executed: boolean;
  message: string;
  orphan_file_count: number | null;
}

export function useTableHealth(tableName: string) {
  return useQuery<TableHealthResponse>({
    queryKey: ['tableHealth', tableName],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/health`, { params: { table: tableName } });
      return data;
    },
    refetchInterval: 30000
  });
}

export function useExecuteMaintenance() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceResponse, Error, { tableName: string; confirmed: boolean }>({
    mutationFn: async ({ tableName, confirmed }) => {
      const { data } = await axios.post(`${API_BASE}/maintenance`, { table_name: tableName, confirmed });
      return data;
    },
    // Use the variables passed into the mutation, not the response body --
    // neither MaintenanceResponse nor OrphanRemovalResponse echo table_name
    // back, so reading it off `data` silently invalidated the wrong key.
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth', variables.tableName] });
    }
  });
}

export function useRemoveOrphans() {
  const queryClient = useQueryClient();
  return useMutation<OrphanRemovalResponse, Error, { tableName: string; confirmed: boolean }>({
    mutationFn: async ({ tableName, confirmed }) => {
      const { data } = await axios.post(`${API_BASE}/orphans`, { table_name: tableName, confirmed });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth', variables.tableName] });
    }
  });
}

export interface PendingAction {
  confirmationType: 'optimize' | 'orphans';
  targetTable: string;
}

export interface ChatResponse {
  sender: 'user' | 'assistant' | 'system';
  text: string;
  requiresConfirmation?: boolean;
  pendingActions?: PendingAction[];
}

export function useAgentChat() {
  return useMutation<ChatResponse, Error, { tableName: string; message: string; history: any[] }>({
    mutationFn: async ({ tableName, message, history }) => {
      const { data } = await axios.post(`${API_BASE}/chat`, {
        table_name: tableName,
        message,
        history,
      });
      return data;
    },
  });
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

export function useTableHealthHistory(tableName: string, limit: number = 100) {
  return useQuery<HealthHistoryResponse>({
    queryKey: ['tableHealthHistory', tableName],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/health/history`, {
        params: { table: tableName, limit }
      });
      return data;
    },
    refetchInterval: 30000
  });
}