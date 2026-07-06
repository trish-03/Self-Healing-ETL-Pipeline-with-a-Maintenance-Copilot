import { atom } from 'jotai';

export interface Message {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  requiresConfirmation?: boolean;
  confirmationType?: 'optimize' | 'orphans';
  targetTable?: string;
}

export const activeTableAtom = atom<string>('fact_orders');
export const chatInputAtom = atom<string>('');
export const chatHistoryAtom = atom<Message[]>([
  {
    id: 'initial-system',
    sender: 'assistant',
    text: 'Maintenance Copilot active. Ready to analyze MoR layout profiles or scan for orphan metadata.',
    timestamp: new Date()
  }
]);

export const themeAtom = atom<'dark' | 'light'>('dark');