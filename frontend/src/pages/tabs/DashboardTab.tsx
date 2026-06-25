import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  RefreshCw,
  Square,
  Target,
  TrendingUp,
  Zap,
  PlayCircle,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import { cancelTestRun, fetchDashboardStats } from "../../lib/testRuns";
import { formatDuration, formatDashboardDuration, getRunStatusDisplay, isRunActivelyRunning } from "../../lib/formatDuration";
import type { DashboardStats, TestRunRecord } from "../../types";
import {
  TabToolbar,
  TabContent,
  MetricCard,
  LoadingState,
  EmptyState,
  ErrorBanner,
  SecondaryButton,
  SurfaceCard,
} from "../../components/ui/layout";

function formatPassRate(rate: number | null): string {
  if (rate == null) return "N/A";
  return `${rate}%`;
}

const statusToneClass: Record<ReturnType<typeof getRunStatusDisplay>["tone"], string> = {
  passed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  running: "bg-amber-500/20 text-amber-400",
  stale: "bg-slate-600/30 text-slate-400 border border-slate-500/20",
};

function RunStatusBadge({ run }: { run: TestRunRecord }) {
  const { label, tone } = getRunStatusDisplay(run.status, run.created_at);
  return (
    <span
      className={clsx(
        "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
        statusToneClass[tone]
      )}
      title={tone === "stale" ? "Run timed out or was never finalized" : undefined}
    >
      {label}
    </span>
  );
}

export default function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChanged = () => { void load(true); };
    window.addEventListener("qa-genius:test-runs-changed", onChanged);
    const onFocus = () => { void load(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void load(true);
    });
    pollRef.current = setInterval(() => { void load(true); }, 30_000);
    return () => {
      window.removeEventListener("qa-genius:test-runs-changed", onChanged);
      window.removeEventListener("focus", onFocus);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const handleStopRun = useCallback(async (runId: string) => {
    setStoppingRunId(runId);
    try {
      await cancelTestRun(runId);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop run");
    } finally {
      setStoppingRunId(null);
    }
  }, [load]);

  const passRate = stats?.passRatePercent ?? null;
  const avgMs = stats?.averageDurationMs ?? null;
  const total = stats?.totalRuns ?? 0;
  const completed = stats?.completedRuns ?? 0;
  const running = stats?.runningRuns ?? 0;
  const passed = stats?.passedRuns ?? 0;
  const failed = stats?.failedRuns ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <TabToolbar>
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <p className="text-sm text-slate-300 truncate">Analytics from your saved test executions</p>
          {lastRefreshed && (
            <span className="text-[11px] text-slate-600 hidden sm:inline">
              · {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
        <SecondaryButton onClick={() => void load()} disabled={loading} className="ml-auto">
          <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </SecondaryButton>
      </TabToolbar>

      <TabContent>
        {loading && !stats && <LoadingState message="Loading dashboard…" />}

        {error && <ErrorBanner>{error}</ErrorBanner>}

        {!loading && total === 0 && !error && (
          <EmptyState
            icon={BarChart3}
            accent="sky"
            title="No test runs yet"
            description="Run a test from the Test Generator or Test Repository — each execution will appear here with pass rate, duration, and history."
            hint="Metrics update automatically when a run finishes."
            action={
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("qa-genius:navigate-tab", { detail: { tab: "repository" } })
                  )
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                <PlayCircle className="w-4 h-4" />
                Go to Test Repository
              </button>
            }
          />
        )}

        {stats && total > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
              <MetricCard
                label="Pass Rate"
                value={formatPassRate(passRate)}
                hint={completed > 0 ? `Based on ${completed} completed run${completed !== 1 ? "s" : ""}` : "No completed runs yet"}
                icon={Target}
                accent="from-emerald-500 to-teal-600"
                isNa={passRate == null}
              />
              <MetricCard
                label="Avg Duration"
                value={formatDuration(avgMs)}
                hint="Mean time for completed runs with timing data"
                icon={Clock}
                accent="from-sky-500 to-indigo-600"
                isNa={avgMs == null}
              />
              <MetricCard
                label="Total Runs"
                value={String(total)}
                hint="All executions stored in Supabase"
                subValue={completed > 0 ? `${completed} completed` : undefined}
                icon={TrendingUp}
                accent="from-violet-500 to-purple-600"
              />
              <MetricCard
                label="Passed Runs"
                value={String(passed)}
                hint={passed > 0 ? "Successful executions" : "No passes recorded yet"}
                icon={CheckCircle2}
                accent={passed > 0 ? "from-emerald-500 to-green-600" : "from-slate-600 to-slate-700"}
              />
              <MetricCard
                label="Failed Runs"
                value={String(failed)}
                hint={failed > 0 ? "Runs marked FAILED in Supabase" : "No failures recorded"}
                icon={XCircle}
                accent={failed > 0 ? "from-red-500 to-rose-600" : "from-slate-600 to-slate-700"}
              />
              <MetricCard
                label="In Progress"
                value={String(running)}
                hint={running > 0 ? "Active runs in the last 30 minutes" : "No active runs"}
                icon={Zap}
                accent={running > 0 ? "from-amber-500 to-orange-600" : "from-slate-600 to-slate-700"}
              />
            </div>

            {completed === 0 && (
              <SurfaceCard className="mt-4 text-xs text-amber-300/90 border-amber-500/20 bg-amber-500/5">
                <strong>{total} run{total !== 1 ? "s" : ""} recorded</strong> but none are marked completed yet.
                Run a new test to populate Pass Rate and Duration metrics.
                {running > 0 && ` (${running} still active.)`}
              </SurfaceCard>
            )}

            {stats.recentRuns.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">
                  Recent runs
                  <span className="ml-2 text-xs font-normal text-slate-500">(last 30)</span>
                </h3>
                <SurfaceCard padding="p-0" className="overflow-hidden">
                  <table className="qa-data-table">
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Runner</th>
                        <th>When</th>
                        <th className="w-[56px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentRuns.map((run) => {
                        const canStop = isRunActivelyRunning(run.status, run.created_at);
                        return (
                          <tr
                            key={run.id}
                            className={clsx(
                              run.status === "RUNNING" &&
                                !canStop &&
                                "opacity-75"
                            )}
                          >
                            <td className="text-slate-300">
                              <span className="font-medium">{run.feature_name}</span>
                              {run.test_file_name && (
                                <span className="block text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                                  {run.test_file_name}
                                </span>
                              )}
                            </td>
                            <td>
                              <RunStatusBadge run={run} />
                            </td>
                            <td className="text-slate-400 font-mono tabular-nums">
                              {formatDashboardDuration(run.duration_ms || null, run.status)}
                            </td>
                            <td className="text-slate-500 font-mono text-[10px]">{run.runner ?? "—"}</td>
                            <td className="text-slate-500">{new Date(run.created_at).toLocaleString()}</td>
                            <td>
                              {canStop && (
                                <button
                                  type="button"
                                  title="Stop this run"
                                  disabled={stoppingRunId === run.id}
                                  onClick={() => void handleStopRun(run.id)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                                >
                                  <Square className="w-3 h-3 fill-current" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </SurfaceCard>
              </div>
            )}
          </>
        )}
      </TabContent>
    </div>
  );
}
