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
  Shuffle,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { cancelTestRun, fetchDashboardStats } from "../../lib/testRuns";
import { useManualStds } from "../../hooks/useManualStds";
import {
  formatDashboardDuration,
  formatDuration,
  formatIsraeliDateTime,
  getRunStatusDisplay,
  isRunActivelyRunning,
} from "../../lib/formatDuration";
import type { DashboardStats, FlakyTestEntry, TestRunRecord } from "../../types";
import {
  TabToolbar,
  TabContent,
  MetricCard,
  MetricCardSkeleton,
  Skeleton,
  EmptyState,
  ErrorBanner,
  SecondaryButton,
  SurfaceCard,
  SectionHeading,
  PrimaryButton,
  IconButton,
  Badge,
  FOCUS_RING,
  type BadgeTone,
} from "../../components/ui/layout";

function formatPassRate(rate: number | null): string {
  if (rate == null) return "N/A";
  return `${rate}%`;
}

const STATUS_TONES: Record<ReturnType<typeof getRunStatusDisplay>["tone"], BadgeTone> = {
  passed: "success",
  failed: "danger",
  running: "warning",
  stale: "neutral",
};

function RunStatusBadge({ run }: { run: TestRunRecord }) {
  const { label, tone } = getRunStatusDisplay(run.status, run.created_at);
  return (
    <Badge
      tone={STATUS_TONES[tone]}
      dot
      title={tone === "stale" ? "Run timed out or was never finalized" : undefined}
    >
      {label}
    </Badge>
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
  // The <th> keeps aria-sort; the click target is a real <button> so the
  // headers are reachable and operable from the keyboard.
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKeyName)}
        className={clsx(
          "inline-flex items-center gap-1 -mx-1 px-1 rounded uppercase tracking-wider transition-colors hover:text-slate-200",
          active && "text-slate-300",
          FOCUS_RING
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="w-3 h-3" aria-hidden />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-30" aria-hidden />
        )}
      </button>
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
      <p className="text-sm text-slate-500 py-10 text-center">
        Not enough completed runs yet to chart a trend.
      </p>
    );
  }

  const maxTotal = Math.max(1, ...days.map((d) => d.passed + d.failed));

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" aria-hidden /> Passed</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500/90 flex-shrink-0" aria-hidden /> Failed</span>
      </div>

      <div className="flex items-end gap-1.5 sm:gap-2 h-40 border-b border-surface-700">
        {days.map((d, i) => {
          const total = d.passed + d.failed;
          const barHeightPct = total === 0 ? 2 : Math.max((total / maxTotal) * 100, 6);
          const passedSharePct = total === 0 ? 0 : (d.passed / total) * 100;
          return (
            <div
              key={i}
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${d.passed} passed, ${d.failed} failed`}
              className="flex-1 h-full flex flex-col justify-end relative rounded-t-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
            >
              {hovered === i && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 whitespace-nowrap rounded-lg border border-surface-600 bg-surface-900 px-2.5 py-1.5 text-[11px] shadow-xl shadow-black/40 pointer-events-none tabular-nums animate-fade-in">
                  <p className="text-slate-200 font-medium mb-0.5">{d.label}</p>
                  <p className="text-emerald-400">{d.passed} passed</p>
                  <p className="text-red-400">{d.failed} failed</p>
                </div>
              )}
              {/* Bars grow once from the baseline on first paint (staggered);
                  polling re-renders keep the same nodes so it doesn't replay. */}
              <div
                className={clsx(
                  "w-full rounded-t-[3px] flex flex-col-reverse overflow-hidden origin-bottom animate-bar-grow transition-opacity duration-150",
                  hovered !== null && hovered !== i && "opacity-50"
                )}
                style={{ height: `${barHeightPct}%`, animationDelay: `${i * 25}ms` }}
              >
                <div className="w-full bg-emerald-500" style={{ height: `${passedSharePct}%` }} />
                <div className="w-full bg-red-500/90" style={{ height: `${100 - passedSharePct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1.5 sm:gap-2 mt-1.5">
        {days.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-slate-500 truncate tabular-nums">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Thin two-segment ratio bar — passed vs. failed share of a flaky test's recent
 * runs. Reuses the app's existing pass/fail status colors (emerald/red), the same
 * pair PassFailTrendChart already uses, rather than introducing a new palette. */
function PassFailRatioBar({ passed, failed }: { passed: number; failed: number }) {
  const total = passed + failed;
  const passedPct = total === 0 ? 0 : (passed / total) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-surface-700 overflow-hidden flex">
        <div className="h-full bg-emerald-500" style={{ width: `${passedPct}%` }} />
        <div className="h-full bg-red-500/90" style={{ width: `${100 - passedPct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-slate-500 flex-shrink-0 tabular-nums">
        {passed}/{total}
      </span>
    </div>
  );
}

function FlakyTestsPanel({ tests }: { tests: FlakyTestEntry[] }) {
  if (tests.length === 0) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-slate-400 py-1">
        <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden />
        No flaky tests detected in recent runs — every file's results are consistent.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-surface-700/70">
      {tests.map((t) => (
        <li key={t.key} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="min-w-0">
              <p className="text-sm text-slate-200 font-medium truncate">{t.featureName}</p>
              {t.testFileName && (
                <p className="text-[11px] font-mono text-slate-500 truncate">{t.testFileName}</p>
              )}
            </div>
            <Badge
              tone={t.lastStatus === "PASSED" ? "success" : "danger"}
              title="Most recent run's result"
            >
              Last: {t.lastStatus}
            </Badge>
          </div>
          <PassFailRatioBar passed={t.passedCount} failed={t.failedCount} />
        </li>
      ))}
    </ul>
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
      toast.success("Run stopped");
      await load(true);
    } catch (e) {
      toast.error("Couldn't stop the run", { description: e instanceof Error ? e.message : undefined });
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
          <BarChart3 className="w-4 h-4 text-sky-400 flex-shrink-0" aria-hidden />
          <p className="text-sm text-slate-300 truncate">Analytics from your test runs</p>
          {lastRefreshed && (
            <span className="text-xs text-slate-500 hidden md:inline flex-shrink-0 tabular-nums">
              · Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <SecondaryButton onClick={() => void load()} disabled={loading} className="flex-shrink-0">
          <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} aria-hidden />
          Refresh
        </SecondaryButton>
      </TabToolbar>

      <TabContent>
        {loading && !stats && <DashboardSkeleton />}

        {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

        {!loading && total === 0 && !error && (
          <EmptyState
            icon={BarChart3}
            accent="sky"
            title="No test runs yet"
            description="Run a test from the Test Generator or Test Repository — each execution will appear here with pass rate, duration, and history."
            hint="Metrics update automatically when a run finishes."
            action={
              <PrimaryButton
                size="sm"
                icon={PlayCircle}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("qa-genius:navigate-tab", { detail: { tab: "repository" } })
                  )
                }
              >
                Go to Test Repository
              </PrimaryButton>
            }
          />
        )}

        {stats && total > 0 && (
          <div className="space-y-8 animate-fade-in">
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <MetricCard
                  label="Pass Rate"
                  value={formatPassRate(passRate)}
                  hint={completed > 0 ? `Based on ${completed} completed run${completed !== 1 ? "s" : ""}` : "No completed runs yet"}
                  icon={Target}
                  accent="from-emerald-500 to-teal-600"
                  isNa={passRate == null}
                />
                <MetricCard
                  label="Automation Runs"
                  value={String(total)}
                  hint="All Playwright executions stored in Supabase"
                  subValue={completed > 0 ? `${completed} completed` : undefined}
                  icon={TrendingUp}
                  accent="from-violet-500 to-purple-600"
                />
                <MetricCard
                  label="Generated STDs"
                  value={String(stds.length)}
                  hint="Manual STD tables saved"
                  icon={ClipboardList}
                  accent={stds.length > 0 ? "from-teal-500 to-emerald-600" : "from-slate-600 to-slate-700"}
                />
                <MetricCard
                  label="Avg Healing Speed"
                  value={formatDuration(stats.selfHeal.averageDurationMs)}
                  hint={
                    stats.selfHeal.count > 0
                      ? `Based on ${stats.selfHeal.count} Self-Heal attempt${stats.selfHeal.count !== 1 ? "s" : ""}`
                      : "Use Self-Heal on a failed test in Test Repository to start tracking this"
                  }
                  icon={Zap}
                  accent={stats.selfHeal.count > 0 ? "from-amber-500 to-orange-600" : "from-slate-600 to-slate-700"}
                  isNa={stats.selfHeal.averageDurationMs == null}
                />
              </div>

              {completed === 0 && (
                <SurfaceCard padding="px-4 py-3" className="text-xs text-amber-300/90 border-amber-500/20 bg-amber-500/5">
                  <strong className="font-semibold">{total} run{total !== 1 ? "s" : ""} recorded</strong> but none are marked completed yet.
                  Run a new test to populate Pass Rate metrics.
                  {running > 0 && ` (${running} still active.)`}
                </SurfaceCard>
              )}
            </div>

            <section>
              <SectionHeading
                title="Pass / Fail Trend"
                meta="last 14 active days"
                aside={running > 0 ? <Badge tone="warning" dot>{running} running now</Badge> : undefined}
              />
              <SurfaceCard>
                <PassFailTrendChart runs={stats.recentRuns} />
              </SurfaceCard>
            </section>

            <section>
              <SectionHeading
                icon={Shuffle}
                iconClassName="text-amber-400"
                title="Flakiest Tests"
                meta="same file, mixed results · last 300 runs"
              />
              <SurfaceCard>
                <FlakyTestsPanel tests={stats.flakyTests} />
              </SurfaceCard>
            </section>

            {stats.recentRuns.length > 0 && (
              <section>
                <SectionHeading title="Recent Runs" meta={`last ${stats.recentRuns.length}`} />
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
                        <th className="w-[56px]"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRuns.map((run) => {
                        const canStop = isRunActivelyRunning(run.status, run.created_at);
                        return (
                          <tr
                            key={run.id}
                            className={clsx(run.status === "RUNNING" && !canStop && "opacity-60")}
                          >
                            <td className="max-w-[280px]">
                              <span className="block font-medium text-slate-200 truncate" title={run.feature_name}>{run.feature_name}</span>
                              {run.test_file_name && (
                                <span className="block text-[11px] text-slate-500 font-mono truncate mt-0.5" title={run.test_file_name}>
                                  {run.test_file_name}
                                </span>
                              )}
                            </td>
                            <td>
                              <RunStatusBadge run={run} />
                            </td>
                            <td className="text-slate-300 font-mono">
                              {formatDashboardDuration(run.duration_ms || null, run.status)}
                            </td>
                            <td className="text-slate-500 font-mono text-[11px]">{run.runner ?? "—"}</td>
                            <td className="text-slate-400 whitespace-nowrap" dir="ltr">{formatIsraeliDateTime(run.created_at)}</td>
                            <td className="text-right">
                              {canStop && (
                                <IconButton
                                  icon={Square}
                                  label="Stop this run"
                                  tone="danger"
                                  size="sm"
                                  loading={stoppingRunId === run.id}
                                  onClick={() => void handleStopRun(run.id)}
                                  className="text-red-400 bg-red-500/10 border border-red-500/20"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </SurfaceCard>
              </section>
            )}
          </div>
        )}
      </TabContent>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
      <section>
        <Skeleton className="h-4 w-36 mb-3" />
        <SurfaceCard>
          <div className="flex items-end gap-2 h-40">
            {[40, 65, 30, 80, 55, 70, 45, 90, 60, 35, 75, 50].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        </SurfaceCard>
      </section>
      <section>
        <Skeleton className="h-4 w-28 mb-3" />
        <SurfaceCard padding="p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3.5 border-b border-surface-700/70 last:border-0">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3.5 w-12" />
              <Skeleton className="h-3.5 w-20 ml-auto" />
            </div>
          ))}
        </SurfaceCard>
      </section>
    </div>
  );
}
