import { useCallback, useEffect, useState } from "react";
import { BarChart3, Clock, Loader2, RefreshCw, Target, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { fetchDashboardStats } from "../../lib/testRuns";
import type { DashboardStats } from "../../types";

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Target;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-600 bg-surface-800/50 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br", accent)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{hint}</p>
      </div>
    </div>
  );
}

export default function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChanged = () => { void load(); };
    window.addEventListener("qa-genius:test-runs-changed", onChanged);
    return () => window.removeEventListener("qa-genius:test-runs-changed", onChanged);
  }, [load]);

  const passRate = stats?.passRatePercent ?? 0;
  const avgMs = stats?.averageDurationMs ?? 0;
  const total = stats?.totalRuns ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-600 bg-surface-800/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <p className="text-sm text-slate-300">Analytics from your saved test executions</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx("w-3 h-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading && !stats && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading dashboard…
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl">
          <MetricCard
            label="Pass Rate"
            value={`${passRate}% Success Rate`}
            hint="Based on your last 30 completed runs"
            icon={Target}
            accent="from-emerald-500 to-teal-600"
          />
          <MetricCard
            label="Average Duration"
            value={`${formatDuration(avgMs)} average run speed`}
            hint="Mean execution time across recent runs"
            icon={Clock}
            accent="from-sky-500 to-indigo-600"
          />
          <MetricCard
            label="Total Runs"
            value={String(total)}
            hint="All historical executions stored in Supabase"
            icon={TrendingUp}
            accent="from-violet-500 to-purple-600"
          />
        </div>

        {stats && stats.recentRuns.length > 0 && (
          <div className="mt-8 max-w-5xl">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Recent runs</h3>
            <div className="rounded-xl border border-surface-600 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-800 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Feature</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Duration</th>
                    <th className="px-4 py-2.5 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-700">
                  {stats.recentRuns.slice(0, 10).map((run) => (
                    <tr key={run.id} className="hover:bg-surface-800/40">
                      <td className="px-4 py-2.5 text-slate-300">
                        <span className="font-medium">{run.feature_name}</span>
                        {run.test_file_name && (
                          <span className="block text-[10px] text-slate-500 font-mono truncate max-w-[240px]">
                            {run.test_file_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={clsx(
                            "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                            run.status === "PASSED" && "bg-emerald-500/20 text-emerald-400",
                            run.status === "FAILED" && "bg-red-500/20 text-red-400",
                            run.status === "RUNNING" && "bg-sky-500/20 text-sky-400"
                          )}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono">{formatDuration(run.duration_ms)}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {new Date(run.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && total === 0 && (
          <p className="text-sm text-slate-500 mt-6 max-w-lg">
            No runs recorded yet. Execute a test from the Repository tab — each run will appear here automatically.
          </p>
        )}
      </div>
    </div>
  );
}
