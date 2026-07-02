import { atom } from 'jotai';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  requiresConfirmation?: boolean;
  targetTable?: string;
}

// Global active table selector across dashboard and chat
export const activeTableAtom = atom<string>('fact_orders');

// Chat messages history state
export const chatHistoryAtom = atom<ChatMessage[]>([
  {
    id: 'welcome',
    sender: 'assistant',
    text: "Hello! I am your Maintenance Copilot. Ask me about your table health, or type 'optimize table' to run maintenance.",
    timestamp: new Date(),
  },
]);

// Text input buffer state
export const chatInputAtom = atom<string>('');