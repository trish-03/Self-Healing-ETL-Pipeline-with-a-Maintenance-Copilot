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
  status: 'HEALTHY' | 'FRAGMENTED' | 'UNKNOWN';
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth', variables.tableName] });
      queryClient.invalidateQueries({ queryKey: ['tableHealthHistory', variables.tableName] });
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
      queryClient.invalidateQueries({ queryKey: ['tableHealthHistory', variables.tableName] });
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

export function useTableHealthHistory(tableName: string, limit: number = 250) {
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


export interface SimulationResponse {
  batches_run: number;
  total_orders_merged: number;
  total_items_merged: number;
  failed_batches: number[];
}

export interface WatermarkResponse {
  source_name: string;
  last_loaded_at: string | null;
}

export function useWatermark(source: string = 'fact_orders') {
  return useQuery<WatermarkResponse>({
    queryKey: ['watermark', source],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/watermark`, { params: { source } });
      return data;
    },
  });
}

export interface OCCConflictRecord {
  writer_id: number;
  attempted_at: string;
  outcome: 'committed' | 'conflict_failed';
  error_type: string | null;
  error_message: string | null;
}

export interface OCCConflictHistoryResponse {
  count: number;
  conflicts: OCCConflictRecord[];
}

export interface OCCRunSummary {
  writers_launched: number;
  successful_commits: number;
  failed_commits: number;
  occ_detected: boolean;
}

export interface OCCRunWriterOutput {
  writer_id: number;
  stdout: string;
  stderr: string;
  exit_code: number | null;
}

export interface OCCRunResponse {
  status: string;
  summary: OCCRunSummary;
  writers: OCCRunWriterOutput[];
  conflicts: OCCConflictRecord[];
}

export function useOCCConflictHistory(limit: number = 20) {
  return useQuery<OCCConflictHistoryResponse>({
    queryKey: ['occConflictHistory', limit],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/occ/conflicts`, {
        params: { limit }
      });
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useRunOCC() {
  const queryClient = useQueryClient();

  return useMutation<OCCRunResponse, Error>({
    mutationFn: async () => {
      const { data } = await axios.post(`${API_BASE}/occ/run`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['occConflictHistory'] });
    }
  });
}

export function useRunSimulation() {
  const queryClient = useQueryClient();
  return useMutation<SimulationResponse, Error, { numBatches: number; numUpdatesPerBatch: number; numNewOrdersPerBatch: number }>({
    mutationFn: async ({ numBatches, numUpdatesPerBatch, numNewOrdersPerBatch }) => {
      const { data } = await axios.post(`${API_BASE}/simulate`, {
        num_batches: numBatches,
        num_updates_per_batch: numUpdatesPerBatch,
        num_new_orders_per_batch: numNewOrdersPerBatch,
      }, { timeout: 300000 });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth'] });
      queryClient.invalidateQueries({ queryKey: ['tableHealthHistory'] });
      queryClient.invalidateQueries({ queryKey: ['watermark'] });
    }
  });
}