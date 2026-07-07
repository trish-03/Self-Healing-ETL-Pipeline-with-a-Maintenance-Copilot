import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface PendingAction {
  confirmationType: 'optimize' | 'orphans';
  targetTable: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  requiresConfirmation?: boolean;
  pendingActions?: PendingAction[];
}

export const activeTableAtom = atom<string>('fact_orders');
export const chatInputAtom = atom<string>('');
export const chatHistoryAtom = atom<ChatMessage[]>([
  {
    id: 'initial-system',
    sender: 'assistant',
    text: 'Maintenance Copilot active. Ready to analyze MoR layout profiles or scan for orphan metadata.',
    timestamp: new Date()
  }
]);

export const themeAtom = atomWithStorage<'light' | 'dark'>('theme', 'dark');