import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { TableMetrics } from './useTableHealth';

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

export function useExecuteMaintenance() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceResponse, Error, { tableName: string; confirmed: boolean }>({
    mutationFn: async ({ tableName, confirmed }) => {
      const { data } = await api.post('/maintenance', { table_name: tableName, confirmed });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth', variables.tableName] });
      queryClient.invalidateQueries({ queryKey: ['tableHealthHistory', variables.tableName] });
    },
  });
}

export function useRemoveOrphans() {
  const queryClient = useQueryClient();
  return useMutation<OrphanRemovalResponse, Error, { tableName: string; confirmed: boolean }>({
    mutationFn: async ({ tableName, confirmed }) => {
      const { data } = await api.post('/orphans', { table_name: tableName, confirmed });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth', variables.tableName] });
      queryClient.invalidateQueries({ queryKey: ['tableHealthHistory', variables.tableName] });
    },
  });
}