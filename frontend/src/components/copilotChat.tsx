import React from 'react';
import { useAtom } from 'jotai';
import { Send, ShieldAlert, Bot, User } from 'lucide-react';
import { chatHistoryAtom, chatInputAtom } from '../store/uiState';
import { useExecuteMaintenance, useAgentChat } from '../hooks/useLakehouseData';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000/api';

export default function CopilotChat({ tableName }: { tableName: string }) {
  const [messages, setMessages] = useAtom(chatHistoryAtom);
  const [input, setInput] = useAtom(chatInputAtom);
  const maintenanceMutation = useExecuteMaintenance();
  const chatMutation = useAgentChat();

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { id: crypto.randomUUID(), sender: 'user' as const, text: input, timestamp: new Date() };
    const historyForAgent = messages.map(m => ({ sender: m.sender, text: m.text }));
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      const res = await chatMutation.mutateAsync({
        tableName,
        message: input,
        history: historyForAgent,
      });

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: res.sender,
        text: res.text,
        timestamp: new Date(),
        requiresConfirmation: res.requiresConfirmation,
        confirmationType: res.confirmationType,
        targetTable: res.targetTable,
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `Agent request failed: ${err.response?.data?.detail || err.message}`,
        timestamp: new Date(),
      }]);
    }
  };

  const executeCompaction = async (target: string) => {
    if (!target) {
    console.error('executeCompaction called with no target table');
    return;
  }
    try {
      const res = await maintenanceMutation.mutateAsync({ tableName: target, confirmed: true });
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `Storage compaction successful!\n• Files compacted: ${res.files_rewritten}\n• Delete files rewritten: ${res.deletes_rewritten}\n• Snapshots cleared: ${res.files_deleted}\n• File layout updated from ${res.before.live_file_count} small chunks to ${res.after.live_file_count} balanced parquet blocks.`,
        timestamp: new Date()
      }]);
    } catch (err: any) {
        console.error('Full error:', err.response?.data);
        setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `Execution Failed: ${JSON.stringify(err.response?.data?.detail) || err.message}`,
        timestamp: new Date()
     }]);
  }
  };

  const executeOrphanRemoval = async (target: string) => {
    if (!target) {
    console.error('executeOrphanRemoval called with no target table');
    return;
  }
    try {
      const { data } = await axios.post(`${API_BASE}/orphans`, { table_name: target, confirmed: true });
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `Orphan removal complete for ${target}.\n${data.message}`,
        timestamp: new Date()
      }]);
    } catch (err: any) {
      console.error('Full error:', err.response?.data);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `Orphan File removal failed: ${JSON.stringify(err.response?.data?.detail) || err.message}`,
        timestamp: new Date()
  }]);
}
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl p-3 text-xs flex gap-2 ${
              msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-200'
            }`}>
              {msg.sender !== 'user' && <Bot size={14} className="text-indigo-400 shrink-0 mt-0.5" />}
              <div className="space-y-2">
                <p className="whitespace-pre-line">{msg.text}</p>

                {msg.requiresConfirmation && (
                  <div className="p-3 bg-slate-950 border border-amber-500/30 rounded-lg space-y-2 mt-2">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                      <ShieldAlert size={14} />
                      <span>Authorization Gate Triggered</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Confirm {msg.confirmationType === 'orphans' ? 'orphan file removal' : 'mutating storage layout'} for <code>{msg.targetTable}</code>?
                    </p>
                    <button
                        onClick={() =>
                          msg.confirmationType === 'orphans'
                            ? executeOrphanRemoval(msg.targetTable!)
                            : executeCompaction(msg.targetTable!)
                        }
                        disabled={maintenanceMutation.isPending}
                        className="w-full bg-denzing-green hover:bg-denzing-green-hover disabled:opacity-50 text-white font-bold py-1.5 px-3 rounded text-[10px] tracking-wide transition uppercase shadow-sm"
                    >
                        {maintenanceMutation.isPending
                          ? "Invoking Spark Session..."
                          : msg.confirmationType === 'orphans'
                            ? "Authorize Orphan Removal"
                            : "Authorize Layout Compaction"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-slate-800 flex gap-2 bg-slate-900/50">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about table health, or type 'optimize'..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg text-xs px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 transition"
        />
        <button
            onClick={handleSend}
            disabled={chatMutation.isPending}
            className="bg-denzing-green hover:bg-denzing-green-hover disabled:opacity-50 p-2.5 rounded-lg text-white transition shadow"
            >
            <Send size={14} />
        </button>
      </div>
    </div>
  );
}