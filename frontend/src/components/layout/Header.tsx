import {
  Bot,
  Maximize2,
  Moon,
  Sun,
} from "lucide-react";

interface HeaderProps {
  activeTable: string;
  setActiveTable: (table: string) => void;

  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;

  currentView: string;

  isCopilotOpen: boolean;
  setIsCopilotOpen: (value: boolean) => void;
}

export default function Header({
  activeTable,
  setActiveTable,
  theme,
  setTheme,
  currentView,
  isCopilotOpen,
  setIsCopilotOpen,
}: HeaderProps) {
  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111827]/50 flex items-center justify-between px-8 shrink-0 z-10">

      <div className="flex items-center gap-4">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Target Iceberg Catalog Table:
        </span>

        <div className="flex bg-slate-100 dark:bg-[#0b0f17] p-1 rounded-lg border border-slate-200 dark:border-slate-800">

          {["fact_orders", "fact_order_items"].map((table) => (
            <button
              key={table}
              onClick={() => setActiveTable(table)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition ${
                activeTable === table
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow border border-slate-300 dark:border-slate-700"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {table.replace("_", " ")}
            </button>
          ))}

        </div>
      </div>

      <div className="flex items-center gap-3">

        <button
          onClick={() =>
            setTheme(theme === "dark" ? "light" : "dark")
          }
          className="p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          {theme === "dark" ? (
            <Sun size={16} />
          ) : (
            <Moon size={16} />
          )}
        </button>

        {currentView !== "full_chat" ? (
          <button
            onClick={() => setIsCopilotOpen(!isCopilotOpen)}
            className="bg-[#226b4d] hover:bg-[#2d7a59] text-white text-xs font-bold py-1.5 px-4 rounded-md flex items-center gap-2 shadow-md transition"
          >
            <Bot size={14} />
            <span>
              {isCopilotOpen ? "Hide Copilot" : "Open Copilot"}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-[#226b4d] bg-[#226b4d]/10 px-3 py-1 rounded border border-[#226b4d]/30">
            <Maximize2 size={12} />
            FULL PANE INTERACTION
          </div>
        )}

      </div>

    </header>
  );
}