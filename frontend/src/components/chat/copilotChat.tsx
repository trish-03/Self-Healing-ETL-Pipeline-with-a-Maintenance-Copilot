import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { Send, ShieldAlert, Bot } from 'lucide-react';
import { chatHistoryAtom, chatInputAtom } from '../../store/chatState';
import { useExecuteMaintenance, useRemoveOrphans } from '../../hooks/useMaintenance';
import { useAgentChat } from '../../hooks/useChat';

interface CopilotChatProps {
  tableName: string;
  pendingPrompt: string | null;
  clearPendingPrompt: () => void;
}

export default function CopilotChat({
  tableName,
  pendingPrompt,
  clearPendingPrompt,
}: CopilotChatProps) {
  const [messages, setMessages] = useAtom(chatHistoryAtom);
  const [input, setInput] = useAtom(chatInputAtom);
  const maintenanceMutation = useExecuteMaintenance();
  const orphanMutation = useRemoveOrphans();
  const chatMutation = useAgentChat();

  const handleSend = async (forcedText?: string) => {
    const textToSend = forcedText ?? input;
    if (!textToSend.trim()) return;

    const userMsg = {
      id: crypto.randomUUID(),
      sender: 'user' as const,
      text: textToSend,
      timestamp: new Date(),
    };
    
    const historyForAgent = [
  ...messages.map(m => ({
    sender: m.sender,
    text: m.text,
  })),
  {
    sender: "user",
    text: textToSend,
  },
];
    setMessages((prev) => [...prev, userMsg]);
    
    if (!forcedText) {
      setInput('');
    }

    try {
      const res = await chatMutation.mutateAsync({
        tableName,
        message: textToSend,
        history: historyForAgent,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: res.sender,
          text: res.text,
          timestamp: new Date(),
          requiresConfirmation: res.requiresConfirmation,
          pendingActions: res.pendingActions,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `Agent request failed: ${err.response?.data?.detail || err.message}`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  

  // Intercept incoming automated error explanation requests from the OCC table
    useEffect(() => {
  if (!pendingPrompt) return;

  let cancelled = false;

  const sendPendingPrompt = async () => {
    if (cancelled) return;

    await handleSend(pendingPrompt);

    if (!cancelled) {
      clearPendingPrompt();
    }
  };

  sendPendingPrompt();

  return () => {
    cancelled = true;
  };

// eslint-disable-next-line react-hooks/exhaustive-deps
}, [pendingPrompt]);

  const executeAction = async (
    messageId: string,
    target: string,
    type: 'optimize' | 'orphans'
  ) => {
    if (!target) {
      console.error('executeAction called with no target table');
      return;
    }

    try {
      if (type === 'optimize') {
        const res = await maintenanceMutation.mutateAsync({ tableName: target, confirmed: true });
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: `Storage compaction successful for ${target}!\n• Files compacted: ${res.files_rewritten}\n• Delete files rewritten: ${res.deletes_rewritten}\n• Snapshots cleared: ${res.files_deleted}\n• File layout updated from ${res.before.live_file_count} small chunks to ${res.after.live_file_count} balanced parquet blocks.`,
            timestamp: new Date(),
          },
        ]);
      } else {
        const res = await orphanMutation.mutateAsync({ tableName: target, confirmed: true });
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: 'assistant',
            text: `Orphan removal complete for ${target}.\n${res.message}`,
            timestamp: new Date(),
          },
        ]);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, pendingActions: m.pendingActions?.filter((a) => a.targetTable !== target) }
            : m
        )
      );
    } catch (err: any) {
      console.error('Full error:', err.response?.data);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `Execution failed for ${target}: ${JSON.stringify(err.response?.data?.detail) || err.message}`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const isPending = maintenanceMutation.isPending || orphanMutation.isPending;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0b0f17]">
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl p-3 text-xs flex gap-2 ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              {msg.sender !== 'user' && <Bot
                    size={14}
                    className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5"
                  />}
              <div className="space-y-2 w-full">
                <p className="whitespace-pre-line">{msg.text}</p>

                {msg.requiresConfirmation && msg.pendingActions && msg.pendingActions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px]">
                      <ShieldAlert size={12} />
                      <span>Authorization Required</span>
                    </div>

                    {msg.pendingActions.map((action) => (
                      <div key={action.targetTable} className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-600 dark:text-slate-400">
                          <code className="font-mono text-slate-700 dark:text-slate-300">{action.targetTable}</code>
                          {' '}— {action.confirmationType === 'orphans' ? 'orphan removal' : 'compaction'}
                        </span>
                        <button
                          onClick={() => executeAction(msg.id, action.targetTable, action.confirmationType)}
                          disabled={isPending}
                          className="bg-denzing-green hover:bg-denzing-green-hover disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-[10px] tracking-wide transition uppercase shadow-sm shrink-0"
                        >
                          {isPending ? 'Working...' : 'Authorize'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2 bg-white dark:bg-[#111827]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about table health, or type 'optimize'..."
          className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-xs px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
        />
        <button
          onClick={() => handleSend()}
          disabled={chatMutation.isPending}
          className="bg-denzing-green hover:bg-denzing-green-hover disabled:opacity-50 p-2.5 rounded-lg text-white transition shadow"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}