import { Bot, X } from "lucide-react";
import CopilotChat from "../chat/copilotChat";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTable: string;
}

export default function CopilotDrawer({
  isOpen,
  onClose,
  activeTable,
}: Props) {
  return (
    <div
      className={`fixed top-0 right-0 h-full w-96 bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col justify-between z-50 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white/80 dark:bg-[#111827]/80 shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-[#226b4d]" />
          <span className="font-bold text-xs tracking-wider text-slate-900 dark:text-white uppercase">
            Copilot Assistant
          </span>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-md transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <CopilotChat tableName={activeTable} />
      </div>
    </div>
  );
}