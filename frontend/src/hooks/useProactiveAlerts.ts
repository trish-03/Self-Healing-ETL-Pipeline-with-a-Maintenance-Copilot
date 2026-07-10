import { useEffect } from 'react';
import type { ChatMessage } from '../store/chatState';
import { WS_BASE } from './api';

interface ProactiveAlertPayload {
  requiresConfirmation?: boolean;
  alertId?: string;
  sender?: 'user' | 'assistant' | 'system';
  text?: string;
  confirmationType?: 'optimize' | 'orphans';
  targetTable?: string;
  pendingActions?: ChatMessage['pendingActions'];
}

interface UseProactiveAlertsArgs {
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  setProactiveAlert: (alert: { text: string; targetTable?: string; alertId?: string } | null) => void;
}

/**
 * Opens a WebSocket to the backend's proactive alert stream so background
 * health-check findings surface even when the Copilot drawer is closed.
 */
export function useProactiveAlerts({ setMessages, setProactiveAlert }: UseProactiveAlertsArgs) {
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/alerts`);

    ws.onmessage = (event) => {
      try {
        const incomingAlert: ProactiveAlertPayload = JSON.parse(event.data);
        if (incomingAlert?.requiresConfirmation) {
          setMessages((prev) => {
            const alreadyPresent = incomingAlert.alertId
              ? prev.some((message) => message.alertId === incomingAlert.alertId)
              : prev.some((message) => message.text === incomingAlert.text && message.alertId === incomingAlert.alertId);
            if (alreadyPresent) return prev;

            return [
              ...prev,
              {
                id: crypto.randomUUID(),
                alertId: incomingAlert.alertId,
                sender: incomingAlert.sender || 'assistant',
                text: incomingAlert.text || 'A background health issue was detected.',
                timestamp: new Date(),
                requiresConfirmation: incomingAlert.requiresConfirmation || false,
                confirmationType: incomingAlert.confirmationType,
                targetTable: incomingAlert.targetTable,
                pendingActions: incomingAlert.pendingActions || [],
              },
            ];
          });

          setProactiveAlert({
            text: incomingAlert.text || 'A background health issue was detected.',
            targetTable: incomingAlert.targetTable,
            alertId: incomingAlert.alertId,
          });
        }
      } catch (error) {
        console.error('Error unpacking proactive alert in app shell:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('App shell proactive alert stream error:', error);
    };

    return () => {
      ws.close();
    };
  }, [setMessages, setProactiveAlert]);
}