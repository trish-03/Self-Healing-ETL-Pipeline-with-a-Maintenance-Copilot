import { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { MessageSquare} from 'lucide-react';

 import { activeTableAtom, themeAtom } from './store/uiState';
 import { chatHistoryAtom } from './store/chatState';
 import { useTableHealth } from './hooks/useTableHealth';
 import { useTableHealthHistory } from './hooks/useTableHealth';
import { transformHealthHistory } from './utils/transformHealthHistory';
import { useProactiveAlerts } from './hooks/useProactiveAlerts';
import type { OCCConflictRecord } from './hooks/useOCC';

import CopilotChat from './components/chat/copilotChat';
import SimulationControl from './components/simulation/SimulationControl';
import OCCControl from './components/occ/OCCControl';
import DashboardOverview from './components/dashboard/DashboardOverview';
import StorageAnalytics from './components/dashboard/StorageAnalytics';

//layout
import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";
import ProactiveAlert from './components/layout/ProactiveAlert';
import CopilotDrawer from './components/layout/CopilotDrawer';


const queryClient = new QueryClient();

function DashboardContent() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'metrics' | 'simulation' | 'occ' | 'full_chat'>('dashboard');
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [proactiveAlert, setProactiveAlert] = useState<{ text: string; targetTable?: string; alertId?: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useAtom(themeAtom);
  const [activeTable, setActiveTable] = useAtom(activeTableAtom);
  const [, setMessages] = useAtom(chatHistoryAtom);
  const { data: health, isLoading } = useTableHealth(activeTable);
  const { data: healthHistory } = useTableHealthHistory(activeTable);
  const queryClient = useQueryClient();
  
  const clearPendingPrompt = useCallback(() => {
  setPendingPrompt(null);
}, []);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tableHealth', activeTable] });
    queryClient.invalidateQueries({ queryKey: ['tableHealthHistory', activeTable] });
  };

  const handleExplainOCC = (record: OCCConflictRecord) => {
  const technicalSummary =
    record.error_message
      ?.split("\n")
      .slice(0, 10)
      .join("\n") ?? "No technical details available.";

  const prompt = `
Explain this Apache Iceberg Optimistic Concurrency Control (OCC) conflict.

Summary

Writer: ${record.writer_id}
Outcome: ${record.outcome}
Failure Type: ${record.error_type ?? "Unknown"}

The user-facing message is:

Concurrent write detected.

Another transaction committed changes before this writer could commit.

Apache Iceberg rejected this commit to maintain table consistency.

Please explain:

1. Why this commit failed.
2. Why Apache Iceberg rejected the commit.
3. What Optimistic Concurrency Control protected against.
4. Whether this behavior is expected.
5. Recommended next steps for the user.

`;

  setPendingPrompt(prompt.trim());
  setIsCopilotOpen(true);
};
  // Apply/remove the 'dark' class on the root element whenever theme changes,
  // so Tailwind's dark: variants activate throughout the whole tree.
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useProactiveAlerts({ setMessages, setProactiveAlert });


  // Real chart data, sourced from raw.table_health_history via
  // /api/health/history -- no mocked/fabricated points.
  // Filtered to plain health_check events so the trend line reflects
  // organic growth over time, not the sawtooth maintenance before/after
  // pairs would otherwise introduce.
  const chartData = transformHealthHistory(healthHistory?.history);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100">

      {/* 1. LEFT NAVIGATION SIDEBAR */}
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        isSidebarCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        handleRefresh={handleRefresh}
        setIsCopilotOpen={setIsCopilotOpen}
      />

      {/* 2. CORE VIEWPORT */}
      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <Header
            activeTable={activeTable}
            setActiveTable={setActiveTable}
            theme={theme}
            setTheme={setTheme}
            currentView={currentView}
            isCopilotOpen={isCopilotOpen}
            setIsCopilotOpen={setIsCopilotOpen}
        />
        <div className="flex-1 overflow-y-auto p-8">
            <ProactiveAlert
              alert={proactiveAlert}
              onDismiss={() => setProactiveAlert(null)}
              onOpenChat={() => {
                setCurrentView("full_chat");
                setIsCopilotOpen(false);
                setProactiveAlert(null);
              }}
            />
          {currentView === "dashboard" && (
            <DashboardOverview
              health={health}
              isLoading={isLoading}
              chartData={chartData}
            />
          )}

          {currentView === 'metrics' && (
            <StorageAnalytics activeTable={activeTable} health={health} history={healthHistory?.history} />
          )}

          {currentView === 'simulation' && <SimulationControl />}

          {currentView === 'occ' && (
              <OCCControl
                onExplainError={handleExplainOCC}
              />
            )}

          {currentView === 'full_chat' && (
            <div className="w-full h-full min-h-[500px] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl bg-white dark:bg-[#111827]">
              <div className="bg-slate-50 dark:bg-[#1c2434] px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <MessageSquare size={16} className="text-[#226b4d]" />
                <span className="text-xs font-bold text-slate-900 dark:text-white tracking-wide">Standalone Engineering Console</span>
              </div>
              <div className="h-[calc(100%-40px)]">
                <CopilotChat
                  tableName={activeTable}
                  pendingPrompt={pendingPrompt}
                  clearPendingPrompt={clearPendingPrompt}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 3. SLIDING DRAWER CONTROL SIDEBAR */}
        <CopilotDrawer
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          activeTable={activeTable}
          pendingPrompt={pendingPrompt}
          clearPendingPrompt={clearPendingPrompt}
        />
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