import React from 'react';
import { useAtom } from 'jotai';
import { Send, ShieldAlert, Bot } from 'lucide-react';
import { chatHistoryAtom, chatInputAtom } from '../store/uiState';
import { useExecuteMaintenance, useRemoveOrphans } from '../hooks/useLakehouseData';

export default function CopilotChat({ tableName }: { tableName: string }) {
  const [messages, setMessages] = useAtom(chatHistoryAtom);
  const [input, setInput] = useAtom(chatInputAtom);
  
  const maintenanceMutation = useExecuteMaintenance();
  const orphanMutation = useRemoveOrphans();

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg = { id: crypto.randomUUID(), sender: 'user' as const, text: input, timestamp: new Date() };
    let updated = [...messages, userMsg];
    const cleanInput = input.toLowerCase();

    if (cleanInput.includes('optimize') || cleanInput.includes('compact')) {
      updated.push({
        id: crypto.randomUUID(),
        sender: 'system' as const,
        text: `Triggering layout optimization sequence for ${tableName}...`,
        timestamp: new Date(),
        requiresConfirmation: true,
        confirmationType: 'optimize',
        targetTable: tableName
      });
    } else if (cleanInput.includes('orphan') || cleanInput.includes('clean')) {
      updated.push({
        id: crypto.randomUUID(),
        sender: 'system' as const,
        text: `Evaluating unreferenced metadata blocks and dangling orphan files for ${tableName}...`,
        timestamp: new Date(),
        requiresConfirmation: true,
        confirmationType: 'orphans',
        targetTable: tableName
      });
    } else {
      updated.push({
        id: crypto.randomUUID(),
        sender: 'assistant' as const,
        text: "Command unmapped. You can say 'optimize table' to invoke position-delete restructuring, or 'clean orphans' to clear unreferenced staging artifacts.",
        timestamp: new Date()
      });
    }

    setMessages(updated);
    setInput('');
  };

  const handleConfirmAction = async (target: string, type: 'optimize' | 'orphans') => {
    try {
      if (type === 'optimize') {
        const res = await maintenanceMutation.mutateAsync({ tableName: target, confirmed: true });
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `✨ Compaction Engine Finished!\n• Data Files Compacted: ${res.files_rewritten}\n• Position Deletes Collapsed: ${res.deletes_rewritten}\n• Snapshots Purged: ${res.files_deleted}\n• Data layout updated from ${res.before.live_file_count} chunks down to ${res.after.live_file_count} optimized Parquet blocks.`,
          timestamp: new Date()
        }]);
      } else {
        const res = await orphanMutation.mutateAsync({ tableName: target, confirmed: true });
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: `🛡️ Orphan Eviction Success!\n• Extraneous Files Removed: ${res.orphans_removed}\n• Leakage Volume Recovered: ${(res.bytes_freed / 1024).toFixed(2)} KB\n• State Status: ${res.status}`,
          timestamp: new Date()
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: `🚨 Execution Aborted: ${err.response?.data?.detail || err.message}`,
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
                      <span>Security Guardrail Verification</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Authorize runtime transaction execution against <code>{msg.targetTable}</code>?
                    </p>
                    <button
                      onClick={() => handleConfirmAction(msg.targetTable!, msg.confirmationType!)}
                      disabled={maintenanceMutation.isPending || orphanMutation.isPending}
                      className="w-full bg-[#226b4d] hover:bg-[#2d7a59] disabled:opacity-50 text-white font-bold py-1.5 px-3 rounded text-[10px] tracking-wide transition uppercase shadow-sm"
                    >
                      {maintenanceMutation.isPending || orphanMutation.isPending ? "Invoking Spark Session..." : `Confirm ${msg.confirmationType}`}
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
          placeholder="Ask copilot to 'optimize table' or 'clean orphans'..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg text-xs px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 transition"
        />
        <button onClick={handleSend} className="bg-[#226b4d] hover:bg-[#2d7a59] p-2.5 rounded-lg text-white transition shadow">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}