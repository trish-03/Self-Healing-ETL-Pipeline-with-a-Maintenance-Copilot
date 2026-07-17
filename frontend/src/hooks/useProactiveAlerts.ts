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
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/ws/alerts`);

      ws.onopen = () => {
        console.info('App shell proactive alert stream connected.');
      };

      ws.onmessage = (event) => {
        try {
          const incomingAlert: ProactiveAlertPayload = JSON.parse(event.data);
        
        setMessages((prev) => {
          const alreadyPresent = incomingAlert.alertId
            ? prev.some((message) => message.alertId === incomingAlert.alertId)
            : false;
            
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

        if (incomingAlert?.requiresConfirmation) {
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

      ws.onclose = () => {
        if (isCancelled) {
          return;
        }

        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws?.close();
    };
  }, [setMessages, setProactiveAlert]);
}