import { atom } from 'jotai';
import type { PendingAction } from '../hooks/useChat';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  alertId?: string;
  targetTable?: string;
  requiresConfirmation?: boolean;
  pendingActions?: PendingAction[];
}

export const chatInputAtom = atom<string>('');
export const chatHistoryAtom = atom<ChatMessage[]>([
  {
    id: 'initial-system',
    sender: 'assistant',
    text: 'Maintenance Copilot active. Ready to analyze MoR layout profiles or scan for orphan metadata.',
    timestamp: new Date(),
  },
]);