import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

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
      const { data } = await api.get('/watermark', { params: { source } });
      return data;
    },
  });
}

export function useRunSimulation() {
  const queryClient = useQueryClient();
  return useMutation
    <SimulationResponse,
    Error,
    { numBatches: number; numUpdatesPerBatch: number; numNewOrdersPerBatch: number }
  >({
    mutationFn: async ({ numBatches, numUpdatesPerBatch, numNewOrdersPerBatch }) => {
      const { data } = await api.post(
        '/simulate',
        {
          num_batches: numBatches,
          num_updates_per_batch: numUpdatesPerBatch,
          num_new_orders_per_batch: numNewOrdersPerBatch,
        },
        { timeout: 600000 }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tableHealth'] });
      queryClient.invalidateQueries({ queryKey: ['tableHealthHistory'] });
      queryClient.invalidateQueries({ queryKey: ['watermark'] });
    },
  });
}