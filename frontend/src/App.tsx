import React, { useState } from 'react';
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
  ChevronRight
} from 'lucide-react';

import { activeTableAtom } from './store/uiState';
import { useTableHealth } from './hooks/useLakehouseData';
import CopilotChat from './components/CopilotChat';

const queryClient = new QueryClient();

function DashboardContent() {
  // Navigation: Dashboard View, Deep Metrics View, or Full-Page Dedicated Chat View
  const [currentView, setCurrentView] = useState<'dashboard' | 'metrics' | 'full_chat'>('dashboard');
  
  // Slide-out Copilot drawer state
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  
  // Left Sidebar Collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [activeTable, setActiveTable] = useAtom(activeTableAtom);
  const { data: health, isLoading } = useTableHealth(activeTable);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-100">
      
      {/* 1. LEFT NAVIGATION SIDEBAR (Collapsible) */}
      <aside 
        className={`bg-[#111827] border-r border-slate-800 flex flex-col justify-between shrink-0 transition-all duration-300 relative ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Collapse Toggle Handle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-20 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 p-1 rounded-full z-20 hidden md:block"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div>
          {/* Brand Header */}
          <div className={`p-6 border-b border-slate-800 flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="p-2 bg-[#226b4d]/10 rounded-lg shrink-0">
              <Server className="text-[#226b4d] h-5 w-5" />
            </div>
            {!isSidebarCollapsed && (
              <div>
                <h1 className="font-extrabold text-sm tracking-wide text-white">DENZING</h1>
                <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Lakehouse Engine</p>
              </div>
            )}
          </div>
          
          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5">
            <button
              onClick={() => setCurrentView('dashboard')}
              title="Dashboard Overview"
              className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
                isSidebarCollapsed ? 'justify-center p-2.5' : 'px-4 py-2.5 gap-3'
              } ${
                currentView === 'dashboard' ? 'bg-denzing-green text-white shadow' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard size={16} className="shrink-0" />
              {!isSidebarCollapsed && <span>Dashboard Overview</span>}
            </button>

            <button
              onClick={() => setCurrentView('metrics')}
              title="Storage Analytics"
              className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
                isSidebarCollapsed ? 'justify-center p-2.5' : 'px-4 py-2.5 gap-3'
              } ${
                currentView === 'metrics' ? 'bg-denzing-green text-white shadow' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Activity size={16} className="shrink-0" />
              {!isSidebarCollapsed && <span>Storage Analytics</span>}
            </button>

            <button
              onClick={() => {
                setCurrentView('full_chat');
                setIsCopilotOpen(false);
              }}
              title="Dedicated Work Chat"
              className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
                isSidebarCollapsed ? 'justify-center p-2.5' : 'px-4 py-2.5 gap-3'
              } ${
                currentView === 'full_chat' ? 'bg-denzing-green text-white shadow' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <MessageSquare size={16} className="shrink-0" />
              {!isSidebarCollapsed && <span>Dedicated Work Chat</span>}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer System Info */}
        <div className="p-4 border-t border-slate-800 text-center text-[10px] text-slate-500 font-medium whitespace-nowrap overflow-hidden">
          {isSidebarCollapsed ? "v1.28" : "Maintenance Engine v1.28.1"}
        </div>
      </aside>

      {/* 2. CORE VIEWPORT CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        
        {/* TOP SYSTEM HEADER BAR */}
        <header className="h-16 border-b border-slate-800 bg-[#111827]/50 flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Context:</span>
            <div className="flex bg-[#0b0f17] p-1 rounded-lg border border-slate-800">
              {['fact_orders', 'fact_order_items'].map((table) => (
                <button
                  key={table}
                  onClick={() => setActiveTable(table)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition ${
                    activeTable === table ? 'bg-slate-800 text-white shadow border border-slate-700' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {table.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* RENDER SIDEBAR DRAWER CONTROLLER ONLY IF NOT IN FULL CHAT MODE */}
          {currentView !== 'full_chat' ? (
            <button
              onClick={() => setIsCopilotOpen(!isCopilotOpen)}
              className="bg-denzing-green hover:bg-denzing-green-hover text-white text-xs font-bold py-1.5 px-4 rounded-md flex items-center gap-2 shadow-md transition"
            >
              <Bot size={14} />
              <span>{isCopilotOpen ? "Hide Side Copilot" : "Open Side Copilot"}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-[#226b4d] bg-[#226b4d]/10 px-3 py-1 rounded border border-[#226b4d]/30">
              <Maximize2 size={12} />
              MAXIMUM SCREEN ESTATE CONSOLE
            </div>
          )}
        </header>

        {/* COMPONENT BODY AREA LAYOUT ROUTING */}
        <div className="flex-1 overflow-y-auto p-8">
          {currentView === 'dashboard' && (
            <div className="space-y-6">
              {/* Scorecards row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#111827] border border-slate-800 p-6 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Infrastructure Status</span>
                    <span className={`text-lg font-extrabold flex items-center gap-2 ${
                      health?.status === 'FRAGMENTED' ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {isLoading ? 'Scanning Cluster...' : health?.status}
                      {!isLoading && (health?.status === 'FRAGMENTED' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />)}
                    </span>
                  </div>
                </div>
                <div className="bg-[#111827] border border-slate-800 p-6 rounded-xl">
                  <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Live Parquet File Blocks</span>
                  <span className="text-3xl font-black text-white tracking-tight">{isLoading ? '...' : health?.metrics.live_file_count}</span>
                </div>
                <div className="bg-[#111827] border border-slate-800 p-6 rounded-xl">
                  <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase block mb-1">Average Block Payload Size</span>
                  <span className="text-3xl font-black text-white tracking-tight">
                    {isLoading ? '...' : `${((health?.metrics.average_file_size_bytes ?? 0) / 1024).toFixed(2)} KB`}
                  </span>
                </div>
              </div>

              {/* Chart Slot */}
              <div className="bg-[#111827] border border-slate-800 h-96 rounded-xl p-6 flex flex-col justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Metadata Fragment Layout Analytics</h3>
                <div className="flex-1 flex items-center justify-center text-slate-600 italic text-xs">
                  [Recharts System Component Container]
                </div>
              </div>
            </div>
          )}

          {currentView === 'metrics' && (
            <div className="bg-[#111827] border border-slate-800 p-6 rounded-xl text-slate-400 text-xs tracking-wide">
              📊 <b>Deep File Manifest Log Arrays</b>: Extended analysis charts, unpartitioned file skew indexes, and historical snapshot delta metrics.
            </div>
          )}

          {/* 🖥️ DEDICATED FULL SCREEN CHAT PANE */}
          {currentView === 'full_chat' && (
            <div className="w-full h-full min-h-[500px] border border-slate-800 rounded-xl overflow-hidden shadow-xl bg-[#111827]">
              <div className="bg-[#1c2434] px-6 py-3 border-b border-slate-800 flex items-center gap-2">
                <MessageSquare size={16} className="text-denzing-green" />
                <span className="text-xs font-bold text-white tracking-wide">Standalone Engineering Console</span>
              </div>
              <div className="h-[calc(100%-40px)]">
                <CopilotChat tableName={activeTable} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 3. SLIDING DRAWER CONTROL SIDEBAR */}
      <div 
        className={`fixed top-0 right-0 h-full w-96 bg-[#111827] border-l border-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col justify-between z-50 ${
          isCopilotOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#111827]/80 shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-denzing-green" />
            <span className="font-bold text-xs tracking-wider text-white uppercase">Copilot Assistant</span>
          </div>
          <button 
            onClick={() => setIsCopilotOpen(false)}
            className="text-slate-400 hover:text-white p-1 rounded-md transition hover:bg-slate-800"
          >
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