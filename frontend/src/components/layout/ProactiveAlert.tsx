import { Bell, ArrowRight } from "lucide-react";

interface ProactiveAlertProps {
  alert: {
    text: string;
    targetTable?: string;
    alertId?: string;
  } | null;

  onOpenChat: () => void;
  onDismiss: () => void;
}

export default function ProactiveAlert({
  alert,
  onOpenChat,
  onDismiss,
}: ProactiveAlertProps) {
  if (!alert) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-4 shadow-lg backdrop-blur flex items-start gap-3">
      <div className="rounded-full bg-amber-100 dark:bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
        <Bell size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
          Background health alert detected
        </p>

        <p className="text-xs text-amber-800 dark:text-amber-100/90 mt-1 whitespace-pre-line">
          {alert.text}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onOpenChat}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 transition"
        >
          Open Chat
          <ArrowRight size={12} />
        </button>

        <button
          onClick={onDismiss}
          className="rounded-lg border border-amber-300 dark:border-amber-500/30 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-800 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}