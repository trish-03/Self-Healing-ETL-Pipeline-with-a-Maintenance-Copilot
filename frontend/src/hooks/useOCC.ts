import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

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

export function useOCCConflictHistory(limit: number = 5) {
  return useQuery<OCCConflictHistoryResponse>({
    queryKey: ['occConflictHistory', limit],
    queryFn: async () => {
      const { data } = await api.get('/occ/conflicts', { params: { limit } });
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useRunOCC() {
  const queryClient = useQueryClient();
  return useMutation<OCCRunResponse, Error>({
    mutationFn: async () => {
      const { data } = await api.post('/occ/run');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['occConflictHistory'] });
    },
  });
}