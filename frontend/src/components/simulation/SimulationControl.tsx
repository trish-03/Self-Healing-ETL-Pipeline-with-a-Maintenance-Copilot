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
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 rounded-xl">
        <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2 mb-1">
          <Clock size={12} />
          Current Watermark (fact_orders)
        </span>
        <span className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
          {watermarkLoading ? '...' : (watermark?.last_loaded_at ?? 'No watermark set yet')}
        </span>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          The next simulation run will generate data starting strictly after this point.
        </p>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Simulation Parameters</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Number of Batches</span>
            <input
              type="number"
              value={numBatches}
              onChange={(e) => setNumBatches(Number(e.target.value))}
              min={1}
              className="w-full bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Updates per Batch</span>
            <input
              type="number"
              value={numUpdates}
              onChange={(e) => setNumUpdates(Number(e.target.value))}
              min={0}
              className="w-full bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">New Orders per Batch</span>
            <input
              type="number"
              value={numNewOrders}
              onChange={(e) => setNumNewOrders(Number(e.target.value))}
              min={0}
              className="w-full bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-slate-800 rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 transition"
            />
          </label>
        </div>

        <button
          onClick={handleRun}
          disabled={simulation.isPending}
          className="bg-[#226b4d] hover:bg-[#2d7a59] disabled:opacity-50 text-white text-xs font-bold py-2.5 px-5 rounded-md flex items-center gap-2 shadow-md transition"
        >
          <PlayCircle size={16} />
          {simulation.isPending ? `Running ${numBatches} batches -- this may take a while...` : 'Run Simulation'}
        </button>
      </div>

      {simulation.isSuccess && (
        <div className="bg-white dark:bg-[#111827] border border-emerald-500/30 p-5 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
            <CheckCircle2 size={16} />
            Simulation Complete
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-600 dark:text-slate-300">
            <div>
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Batches Run</span>
              <span className="font-bold text-slate-900 dark:text-white">{simulation.data.batches_run}</span>
            </div>
            <div>
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Orders Merged</span>
              <span className="font-bold text-slate-900 dark:text-white">{simulation.data.total_orders_merged}</span>
            </div>
            <div>
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Items Merged</span>
              <span className="font-bold text-slate-900 dark:text-white">{simulation.data.total_items_merged}</span>
            </div>
            <div>
              <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wide">Failed Batches</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {simulation.data.failed_batches.length === 0 ? 'None' : simulation.data.failed_batches.join(', ')}
              </span>
            </div>
          </div>
        </div>
      )}

      {simulation.isError && (
        <div className="bg-white dark:bg-[#111827] border border-red-500/30 p-5 rounded-xl flex items-center gap-2 text-red-500 text-xs">
          <AlertTriangle size={16} />
          Simulation failed: {(simulation.error as any)?.response?.data?.detail || simulation.error?.message}
        </div>
      )}
    </div>
  );
}