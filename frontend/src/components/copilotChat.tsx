import React from 'react';
import { useAtom } from 'jotai';
import { Send, ShieldAlert, Bot, User } from 'lucide-react';
import { chatHistoryAtom, chatInputAtom } from '../store/uiState';
import { useExecuteMaintenance } from '../hooks/useLakehouseData';

export default function CopilotChat({ tableName }: { tableName: string }) {
  const [messages, setMessages] = useAtom(chatHistoryAtom);
  const [input, setInput] = useAtom(chatInputAtom);
  const mutation = useExecuteMaintenance();

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg = { id: crypto.randomUUID(), sender: 'user' as const, text: input, timestamp: new Date() };
    let updated = [...messages, userMsg];

    // Simple pattern matching for local verification before we inject the AI Agent module
    if (input.toLowerCase().includes('optimize') || input.toLowerCase().includes('compact')) {
      updated.push({
        id: crypto.randomUUID(),
        sender: 'system' as const,
        text: `Triggering optimization sequence for ${tableName}...`,
        timestamp: new Date(),
        requiresConfirmation: true,
        targetTable: tableName
      });
    } else {
      updated.push({
        id: crypto.randomUUID(),
        sender: 'assistant' as const,
        text: "I understand. Once the AI module is linked, I can execute full natural language inquiries against your Iceberg catalog.",
        timestamp: new Date()
      });
    }

    setMessages(updated);
    setInput('');
  };

  const executeCompaction = async (target: string) => {
    try {
      const res = await mutation.mutateAsync({ tableName: target, confirmed: true });
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: ` Storage compaction successful!\n• Files compacted: ${res.files_rewritten}\n• Snapshots cleared: ${res.files_deleted}\n• File layout updated from ${res.before.live_file_count} small chunks to ${res.after.live_file_count} balanced parquet blocks.`,
        timestamp: new Date()
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sender: 'assistant',
        text: ` Execution Failed: ${err.response?.data?.detail || err.message}`,
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
                    <p className="text-[11px] text-slate-400">Confirm mutating storage layout for <code>{msg.targetTable}</code>?</p>
                    // Inside your CopilotChat component button returns...
                    <button
                        onClick={() => executeCompaction(msg.targetTable!)}
                        disabled={mutation.isPending}
                        className="w-full bg-denzing-green hover:bg-denzing-green-hover disabled:opacity-50 text-white font-bold py-1.5 px-3 rounded text-[10px] tracking-wide transition uppercase shadow-sm"
                    >
                        {mutation.isPending ? "Invoking Spark Session..." : "Authorize Layout Compaction"}
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
          placeholder="Type 'optimize'..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg text-xs px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 transition"
        />
        <button 
            onClick={handleSend} 
            className="bg-denzing-green hover:bg-denzing-green-hover p-2.5 rounded-lg text-white transition shadow"
            >
            <Send size={14} />
        </button>
      </div>
    </div>
  );
}