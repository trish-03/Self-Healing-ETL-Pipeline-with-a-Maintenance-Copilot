import {
  Activity,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MessageSquare,
  PlaySquare,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";

export type DashboardView =
  | "dashboard"
  | "metrics"
  | "simulation"
  | "occ"
  | "full_chat";

interface SidebarProps {
  currentView: DashboardView;
  setCurrentView: React.Dispatch<React.SetStateAction<DashboardView>>;

  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  handleRefresh: () => void;

  setIsCopilotOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function Sidebar({
  currentView,
  setCurrentView,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  handleRefresh,
  setIsCopilotOpen,
}: SidebarProps) {
  return (
    <aside
      className={`bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 transition-all duration-300 relative ${
        isSidebarCollapsed ? "w-20" : "w-64"
      }`}
    >
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className="absolute -right-3 top-20 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 p-1 rounded-full z-20 hidden md:block"
      >
        {isSidebarCollapsed ? (
          <ChevronRight size={14} />
        ) : (
          <ChevronLeft size={14} />
        )}
      </button>

      <div>
        <div
          className={`p-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 ${
            isSidebarCollapsed ? "justify-center" : ""
          }`}
        >
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Refresh metrics and chart"
          >
            <RefreshCw size={16} />
          </button>

          <div className="p-2 bg-[#226b4d]/10 rounded-lg shrink-0">
            <Server className="text-[#226b4d] h-5 w-5" />
          </div>

          {!isSidebarCollapsed && (
            <div>
              <h1 className="font-extrabold text-sm tracking-wide text-slate-900 dark:text-white">
                LAKEHOUSE COPILOT
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wider uppercase">
                Project 2 Control Plane
              </p>
            </div>
          )}
        </div>

        <nav className="p-4 space-y-1.5">
          <button
            onClick={() => setCurrentView("dashboard")}
            className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
              isSidebarCollapsed
                ? "justify-center p-2.5"
                : "px-4 py-2.5 gap-3"
            } ${
              currentView === "dashboard"
                ? "bg-[#226b4d] text-white shadow"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <LayoutDashboard size={16} />
            {!isSidebarCollapsed && <span>Dashboard Overview</span>}
          </button>

          <button
            onClick={() => setCurrentView("metrics")}
            className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
              isSidebarCollapsed
                ? "justify-center p-2.5"
                : "px-4 py-2.5 gap-3"
            } ${
              currentView === "metrics"
                ? "bg-[#226b4d] text-white shadow"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Activity size={16} />
            {!isSidebarCollapsed && <span>Storage Analytics</span>}
          </button>

          <button
            onClick={() => setCurrentView("simulation")}
            className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
              isSidebarCollapsed
                ? "justify-center p-2.5"
                : "px-4 py-2.5 gap-3"
            } ${
              currentView === "simulation"
                ? "bg-[#226b4d] text-white shadow"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <PlaySquare size={16} />
            {!isSidebarCollapsed && <span>Simulation Control</span>}
          </button>

          <button
            onClick={() => setCurrentView("occ")}
            className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
              isSidebarCollapsed
                ? "justify-center p-2.5"
                : "px-4 py-2.5 gap-3"
            } ${
              currentView === "occ"
                ? "bg-[#226b4d] text-white shadow"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <ShieldAlert size={16} />
            {!isSidebarCollapsed && <span>OCC Demo</span>}
          </button>

          <button
            onClick={() => {
              setCurrentView("full_chat");
              setIsCopilotOpen(false);
            }}
            className={`w-full flex items-center rounded-lg text-xs font-semibold tracking-wide transition ${
              isSidebarCollapsed
                ? "justify-center p-2.5"
                : "px-4 py-2.5 gap-3"
            } ${
              currentView === "full_chat"
                ? "bg-[#226b4d] text-white shadow"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
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
  );
}