import { useMutation } from '@tanstack/react-query';
import { api } from './api';

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
      const { data } = await api.post('/chat', {
        table_name: tableName,
        message,
        history,
      });
      return data;
    },
  });
}