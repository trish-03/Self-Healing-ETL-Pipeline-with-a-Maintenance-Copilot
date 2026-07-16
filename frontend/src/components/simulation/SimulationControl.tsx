import { useState } from 'react';
import { PlayCircle, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useWatermark, useRunSimulation } from '../../hooks/useSimulation';

export default function SimulationControl() {
  const [numBatches, setNumBatches] = useState(70);
  const [numUpdates, setNumUpdates] = useState(10);
  const [numNewOrders, setNumNewOrders] = useState(5);

  const { data: watermark, isLoading: watermarkLoading } = useWatermark();
  const simulation = useRunSimulation();

  const handleRun = () => {
    simulation.mutate({
      numBatches,
      numUpdatesPerBatch: numUpdates,
      numNewOrdersPerBatch: numNewOrders,
    });
  };

  return (
    <div className="space-y-5">
      {/* Watermark + Parameters in one panel */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Watermark row */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <Clock size={14} className="text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Current Watermark — fact_orders
            </span>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              {watermarkLoading ? '...' : (watermark?.last_loaded_at ?? 'No watermark set yet')}
            </p>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 hidden md:block">
            Next run starts strictly after this point
          </span>
        </div>

        {/* Parameters row — inline, no nested boxes */}
        <div className="px-6 py-5">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-4">
            Simulation Parameters
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Number of Batches
              </span>
              <input
                type="number"
                value={numBatches}
                onChange={(e) => setNumBatches(Number(e.target.value))}
                min={1}
                className="w-full bg-slate-50 dark:bg-[#0b0f17] border-b border-slate-200 dark:border-slate-700 text-sm px-0 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition bg-transparent"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Updates per Batch
              </span>
              <input
                type="number"
                value={numUpdates}
                onChange={(e) => setNumUpdates(Number(e.target.value))}
                min={0}
                className="w-full bg-slate-50 dark:bg-[#0b0f17] border-b border-slate-200 dark:border-slate-700 text-sm px-0 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition bg-transparent"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                New Orders per Batch
              </span>
              <input
                type="number"
                value={numNewOrders}
                onChange={(e) => setNumNewOrders(Number(e.target.value))}
                min={0}
                className="w-full bg-slate-50 dark:bg-[#0b0f17] border-b border-slate-200 dark:border-slate-700 text-sm px-0 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition bg-transparent"
              />
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={simulation.isPending}
              className="bg-[#226b4d] hover:bg-[#2d7a59] disabled:opacity-50 text-white text-xs font-bold py-2.5 px-5 rounded-md flex items-center gap-2 shadow-md transition"
            >
              <PlayCircle size={16} />
              {simulation.isPending
                ? `Running ${numBatches} batches — this may take a while...`
                : 'Run Simulation'}
            </button>
          </div>
        </div>
      </div>

      {/* Success result */}
      {simulation.isSuccess && (
        <div className="bg-white dark:bg-[#111827] border border-emerald-500/30 rounded-xl overflow-hidden">
          <div className="px-6 py-3 border-b border-emerald-500/20 flex items-center gap-2 text-emerald-500 font-bold text-sm bg-emerald-500/5">
            <CheckCircle2 size={15} />
            Simulation Complete
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
            {[
              { label: 'Batches Run', value: simulation.data.batches_run },
              { label: 'Orders Merged', value: simulation.data.total_orders_merged },
              { label: 'Items Merged', value: simulation.data.total_items_merged },
              {
                label: 'Failed Batches',
                value:
                  simulation.data.failed_batches.length === 0
                    ? 'None'
                    : simulation.data.failed_batches.join(', '),
              },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-4">
                <span className="block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  {label}
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {simulation.isError && (
        <div className="bg-white dark:bg-[#111827] border border-red-500/30 rounded-xl px-5 py-4 flex items-center gap-3 text-red-500 text-xs">
          <AlertTriangle size={16} className="shrink-0" />
          Simulation failed: {(simulation.error as any)?.response?.data?.detail || simulation.error?.message}
        </div>
      )}
    </div>
  );
}