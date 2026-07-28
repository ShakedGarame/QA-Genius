import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  RefreshCw,
  Square,
  Target,
  TrendingUp,
  Zap,
  PlayCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import clsx from "clsx";
import { cancelTestRun, fetchDashboardStats } from "../../lib/testRuns";
import { useManualStds } from "../../hooks/useManualStds";
import {
  formatDashboardDuration,
  formatIsraeliDateTime,
  getRunStatusDisplay,
  isRunActivelyRunning,
} from "../../lib/formatDuration";
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

type SortKey = "feature" | "status" | "duration" | "runner" | "when";
type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  sortKeyName,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKeyName: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKeyName === activeKey;
  return (
    <th
      onClick={() => onSort(sortKeyName)}
      className="cursor-pointer select-none hover:text-slate-300 transition-colors"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

interface DayBucket {
  label: string;
  passed: number;
  failed: number;
}

/** Groups completed runs by calendar day (PASSED/FAILED only), ascending, capped to the most recent 14 days that actually have data. */
function bucketRunsByDay(runs: TestRunRecord[]): DayBucket[] {
  const byDay = new Map<string, DayBucket>();
  for (const run of runs) {
    if (run.status !== "PASSED" && run.status !== "FAILED") continue;
    const d = new Date(run.created_at);
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) {
      byDay.set(key, { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), passed: 0, failed: 0 });
    }
    const bucket = byDay.get(key)!;
    if (run.status === "PASSED") bucket.passed += 1;
    else bucket.failed += 1;
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([, v]) => v);
}

function PassFailTrendChart({ runs }: { runs: TestRunRecord[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const days = useMemo(() => bucketRunsByDay(runs), [runs]);

  if (days.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        Not enough completed runs yet to chart a trend.
      </p>
    );
  }

  const maxTotal = Math.max(1, ...days.map((d) => d.passed + d.failed));

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 flex-shrink-0" /> Passed</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 flex-shrink-0" /> Failed</span>
      </div>

      <div className="flex items-end gap-1.5 sm:gap-2 h-40">
        {days.map((d, i) => {
          const total = d.passed + d.failed;
          const barHeightPct = total === 0 ? 2 : Math.max((total / maxTotal) * 100, 6);
          const passedSharePct = total === 0 ? 0 : (d.passed / total) * 100;
          return (
            <div
              key={i}
              className="flex-1 h-full flex flex-col justify-end relative"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            >
              {hovered === i && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 whitespace-nowrap rounded-lg border border-surface-600 bg-surface-900 px-2.5 py-1.5 text-[11px] shadow-xl">
                  <p className="text-slate-300 font-medium">{d.label}</p>
                  <p className="text-emerald-400">{d.passed} passed</p>
                  <p className="text-red-400">{d.failed} failed</p>
                </div>
              )}
              <div
                className="w-full rounded-t-sm bg-surface-700/40 flex flex-col-reverse overflow-hidden transition-all"
                style={{ height: `${barHeightPct}%` }}
              >
                <div className="w-full bg-emerald-500" style={{ height: `${passedSharePct}%` }} />
                <div className="w-full bg-red-500" style={{ height: `${100 - passedSharePct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1.5 sm:gap-2 mt-1.5">
        {days.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[9px] text-slate-600 truncate">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { stds, refresh: refreshStds } = useManualStds();

  useEffect(() => { refreshStds(); }, [refreshStds]);

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

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
    const onStdsChanged = () => { refreshStds(); };
    window.addEventListener("qa-genius:manual-std-changed", onStdsChanged);
    const onFocus = () => { void load(true); };
    window.addEventListener("focus", onFocus);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    pollRef.current = setInterval(() => { void load(true); }, 30_000);
    return () => {
      window.removeEventListener("qa-genius:test-runs-changed", onChanged);
      window.removeEventListener("qa-genius:manual-std-changed", onStdsChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load, refreshStds]);

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
  const total = stats?.totalRuns ?? 0;
  const completed = stats?.completedRuns ?? 0;
  const running = stats?.runningRuns ?? 0;

  const sortedRuns = useMemo(() => {
    const rows = stats?.recentRuns ?? [];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "feature":
          return a.feature_name.localeCompare(b.feature_name) * dir;
        case "status":
          return (
            getRunStatusDisplay(a.status, a.created_at).label.localeCompare(
              getRunStatusDisplay(b.status, b.created_at).label
            ) * dir
          );
        case "duration":
          return ((a.duration_ms ?? 0) - (b.duration_ms ?? 0)) * dir;
        case "runner":
          return (a.runner ?? "").localeCompare(b.runner ?? "") * dir;
        case "when":
        default:
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
    });
  }, [stats, sortKey, sortDir]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <TabToolbar>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BarChart3 className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <p className="text-xs sm:text-sm text-slate-300 truncate">Analytics from your test runs</p>
          {lastRefreshed && (
            <span className="text-[11px] text-slate-600 hidden md:inline flex-shrink-0">
              · {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
        <SecondaryButton onClick={() => void load()} disabled={loading} className="flex-shrink-0">
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <MetricCard
                label="Pass Rate %"
                value={formatPassRate(passRate)}
                hint={completed > 0 ? `Based on ${completed} completed run${completed !== 1 ? "s" : ""}` : "No completed runs yet"}
                icon={Target}
                accent="from-emerald-500 to-teal-600"
                isNa={passRate == null}
              />
              <MetricCard
                label="Total Automation Runs"
                value={String(total)}
                hint="All Playwright executions stored in Supabase"
                subValue={completed > 0 ? `${completed} completed` : undefined}
                icon={TrendingUp}
                accent="from-violet-500 to-purple-600"
              />
              <MetricCard
                label="Generated STDs"
                value={String(stds.length)}
                hint="Manual Standard Test Documentation tables saved"
                icon={ClipboardList}
                accent={stds.length > 0 ? "from-teal-500 to-emerald-600" : "from-slate-600 to-slate-700"}
              />
              <MetricCard
                label="Avg Healing Speed"
                value="N/A"
                hint="Self-Heal duration isn't tracked yet — needs backend instrumentation"
                icon={Zap}
                accent="from-slate-600 to-slate-700"
                isNa
              />
            </div>

            {completed === 0 && (
              <SurfaceCard className="mt-4 text-xs text-amber-300/90 border-amber-500/20 bg-amber-500/5">
                <strong>{total} run{total !== 1 ? "s" : ""} recorded</strong> but none are marked completed yet.
                Run a new test to populate Pass Rate metrics.
                {running > 0 && ` (${running} still active.)`}
              </SurfaceCard>
            )}

            <div className="mt-8">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-slate-200">Pass / Fail Trend</h3>
                {running > 0 && (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    {running} running now
                  </span>
                )}
              </div>
              <SurfaceCard>
                <PassFailTrendChart runs={stats.recentRuns} />
              </SurfaceCard>
            </div>

            {stats.recentRuns.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">
                  Recent runs
                  <span className="ml-2 text-xs font-normal text-slate-500">(last 30)</span>
                </h3>
                <SurfaceCard padding="p-0" className="overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="qa-data-table min-w-[640px]">
                    <thead>
                      <tr>
                        <SortableHeader label="Feature" sortKeyName="feature" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortableHeader label="Status" sortKeyName="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortableHeader label="Duration" sortKeyName="duration" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortableHeader label="Runner" sortKeyName="runner" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortableHeader label="When" sortKeyName="when" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <th className="w-[56px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRuns.map((run) => {
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
                            <td className="text-slate-500" dir="ltr">{formatIsraeliDateTime(run.created_at)}</td>
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
                  </div>
                </SurfaceCard>
              </div>
            )}
          </>
        )}
      </TabContent>
    </div>
  );
}
