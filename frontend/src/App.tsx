import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { 
  LayoutDashboard, 
  Activity, 
  MessageSquare,
  Bot, 
  X, 
  Server, 
  AlertTriangle, 
  CheckCircle2,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Database,
  Moon,
  Sun
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

import { activeTableAtom, themeAtom } from './store/uiState';
import { useTableHealth, useTableHealthHistory } from './hooks/useLakehouseData';
import CopilotChat from './components/copilotChat';

const queryClient = new QueryClient();

function DashboardContent() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'metrics' | 'full_chat'>('dashboard');
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useAtom(themeAtom);
  const [activeTable, setActiveTable] = useAtom(activeTableAtom);
  const { data: health, isLoading } = useTableHealth(activeTable);
  const { data: healthHistory } = useTableHealthHistory(activeTable);

  // Apply/remove the 'dark' class on the root element whenever theme changes,
  // so Tailwind's dark: variants activate throughout the whole tree.
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Real chart data, sourced from raw.table_health_history via
  // /api/health/history -- no mocked/fabricated points.
  // Filtered to plain health_check events so the trend line reflects
  // organic growth over time, not the sawtooth maintenance before/after
  // pairs would otherwise introduce.
  const chartData = (healthHistory?.history ?? [])
    .filter(h => h.event_type === 'health_check')
    .slice(-30)
    .map((h) => ({
      batch: new Date(h.checked_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      live_files: h.live_file_count ?? 0,
      delete_files: h.delete_file_count ?? 0,
    }));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100">

      {/* 1. LEFT NAVIGATION SIDEBAR */}
      <aside className={`bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 transition-all duration-300 relative ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-20 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 p-1 rounded-full z-20 hidden md:block"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div>
          <div className={`p-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="p-2 bg-[#226b4d]/10 rounded-lg shrink-0">
              <Server className="text-[#226b4d] h-5 w-5" />
            </div>
            {!isSidebarCollapsed && (
              <div>
                <h1 className="font-extrabold text-sm tracking-wide text-slate-900 dark:text-white">LAKEHOUSE COPILOT</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wider uppercase">Project 2 Control Plane</p>
              </div>
            )}
          </div>
          
          <nav className="p-4 space-y-1.5">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${isSidebarCollapsed ? 'justify-center p-2.5' : 'px-4 py-2.5 gap-3'} ${currentView === 'dashboard' ? 'bg-[#226b4d] text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <LayoutDashboard size={16} />
              {!isSidebarCollapsed && <span>Dashboard Overview</span>}
            </button>

            <button
              onClick={() => setCurrentView('metrics')}
              className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${isSidebarCollapsed ? 'justify-center p-2.5' : 'px-4 py-2.5 gap-3'} ${currentView === 'metrics' ? 'bg-[#226b4d] text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <Activity size={16} />
              {!isSidebarCollapsed && <span>Storage Analytics</span>}
            </button>

            <button
              onClick={() => { setCurrentView('full_chat'); setIsCopilotOpen(false); }}
              className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${isSidebarCollapsed ? 'justify-center p-2.5' : 'px-4 py-2.5 gap-3'} ${currentView === 'full_chat' ? 'bg-[#226b4d] text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <MessageSquare size={16} />
              {!isSidebarCollapsed && <span>Dedicated Work Chat</span>}
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-center text-[10px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap overflow-hidden">
          {isSidebarCollapsed ? "v2.0" : "Iceberg Engine Monitoring v2.0"}
        </div>
      </aside>

      {/* 2. CORE VIEWPORT */}
      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111827]/50 flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Target Iceberg Catalog Table:</span>
            <div className="flex bg-slate-100 dark:bg-[#0b0f17] p-1 rounded-lg border border-slate-200 dark:border-slate-800">
              {['fact_orders', 'fact_order_items'].map((table) => (
                <button
                  key={table}
                  onClick={() => setActiveTable(table)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition ${activeTable === table ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow border border-slate-300 dark:border-slate-700' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  {table.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {currentView !== 'full_chat' ? (
              <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className="bg-[#226b4d] hover:bg-[#2d7a59] text-white text-xs font-bold py-1.5 px-4 rounded-md flex items-center gap-2 shadow-md transition"
              >
                <Bot size={14} />
                <span>{isCopilotOpen ? "Hide Copilot" : "Open Copilot"}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-[#226b4d] bg-[#226b4d]/10 px-3 py-1 rounded border border-[#226b4d]/30">
                <Maximize2 size={12} />
                FULL PANE INTERACTION PADS
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {currentView === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl flex items-center justify-between overflow-hidden">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Table State Status</span>
                      <span className={`text-base font-extrabold flex items-center gap-1.5 whitespace-nowrap ${health?.status === 'FRAGMENTED' ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {isLoading ? 'Reading...' : health?.status}
                        {!isLoading && (health?.status === 'FRAGMENTED' ? <AlertTriangle size={16} className="shrink-0" /> : <CheckCircle2 size={16} className="shrink-0" />)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Live Parquet Blocks</span>
                    <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{isLoading ? '...' : health?.metrics.live_file_count}</span>
                  </div>

                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Snapshot Count</span>
                    <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{isLoading ? '...' : health?.metrics.snapshot_count}</span>
                  </div>

                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Average File Size</span>
                    <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      {isLoading ? '...' : `${((health?.metrics.average_file_size_bytes ?? 0) / 1024).toFixed(2)} KB`}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Delete Files</span>
                    <span className={`text-2xl font-black tracking-tight ${health?.metrics.delete_file_count && health.metrics.delete_file_count > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`}>
                      {isLoading ? '...' : health?.metrics.delete_file_count}
                    </span>
                  </div>
                </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 h-96 rounded-xl p-6 flex flex-col">
                <div className="mb-4">
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Small-File Frag & Position Delete Accumulation Trend</h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Real snapshot history from raw.table_health_history -- health checks only, maintenance events excluded from this line.</p>
                </div>
                <div className="flex-1 w-full min-h-0">
                  {chartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs italic">
                      No health history yet for this table -- run a health check or maintenance pass to populate this chart.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorLive" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorDeletes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f87171" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="batch" stroke="#6b7280" fontSize={10} tickLine={false} />
                        <YAxis stroke="#6b7280" fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', fontSize: '11px', color: '#e2e8f0' }} />
                        <Area type="monotone" dataKey="live_files" name="Live Data Files" stroke="#6366f1" fillOpacity={1} fill="url(#colorLive)" strokeWidth={2} />
                        <Area type="monotone" dataKey="delete_files" name="Position Deletes" stroke="#f87171" fillOpacity={1} fill="url(#colorDeletes)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentView === 'metrics' && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl text-slate-500 dark:text-slate-400 text-xs space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                <Database size={16} className="text-indigo-500 dark:text-indigo-400" />
                <span>Deep File Manifest Log Arrays: {activeTable}</span>
              </div>
              <p>Active Layout Allocation Details:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                <li>Logical Model Definition: Unpartitioned Append Target Mode</li>
                <li>Average Payload Block Size: {((health?.metrics.average_file_size_bytes ?? 0) / 1024).toFixed(2)} KB</li>
                <li>Storage Structure Mode: Merge-on-Read (MoR)</li>
              </ul>
            </div>
          )}

          {currentView === 'full_chat' && (
            <div className="w-full h-full min-h-[500px] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl bg-white dark:bg-[#111827]">
              <div className="bg-slate-50 dark:bg-[#1c2434] px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <MessageSquare size={16} className="text-[#226b4d]" />
                <span className="text-xs font-bold text-slate-900 dark:text-white tracking-wide">Standalone Engineering Console</span>
              </div>
              <div className="h-[calc(100%-40px)]">
                <CopilotChat tableName={activeTable} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 3. SLIDING DRAWER CONTROL SIDEBAR */}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col justify-between z-50 ${isCopilotOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white/80 dark:bg-[#111827]/80 shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-[#226b4d]" />
            <span className="font-bold text-xs tracking-wider text-slate-900 dark:text-white uppercase">Copilot Assistant</span>
          </div>
          <button onClick={() => setIsCopilotOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-md transition hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <CopilotChat tableName={activeTable} />
        </div>
      </div>

    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContent />
    </QueryClientProvider>
  );
}