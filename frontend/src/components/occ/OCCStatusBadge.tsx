import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  outcome: "committed" | "conflict_failed";
}

export default function OCCStatusBadge({ outcome }: Props) {
  const success = outcome === "committed";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
        success
          ? "bg-emerald-500/10 text-emerald-500"
          : "bg-amber-500/10 text-amber-500"
      }`}
    >
      {success ? (
        <CheckCircle2 size={12} />
      ) : (
        <AlertTriangle size={12} />
      )}

      {outcome.replace("_", " ")}
    </span>
  );
}