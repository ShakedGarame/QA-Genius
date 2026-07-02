import { useEffect, useState } from "react";
import {
  FileCode2, Globe, FileText, ChevronDown, ChevronRight,
  Loader2, Play, Eye, Trash2, RefreshCw, CalendarDays,
  Layers, Search, FlaskConical,
  BrainCircuit, AlertTriangle, Wrench, ScrollText,
} from "lucide-react";
import clsx from "clsx";
import { useTestRepository } from "../../hooks/useTestRepository";
import { useLogHistory } from "../../hooks/useLogHistory";
import { FeatureGroup, LogAnalysisRecord, TestFileInfo, TestRunStatus } from "../../types";
import { MOCK_FEATURES, MOCK_CODE_MAP } from "../../data/mockData";
import { routeRunToRepository } from "../../lib/cloudRunner";
import {
  TabToolbar,
  TabContent,
  EmptyState,
  LoadingState,
  DemoBanner,
  ErrorBanner,
  SecondaryButton,
  FormInput,
} from "../../components/ui/layout";

type HistoryView = "tests" | "logs";

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const EXECUTION_STATUS_STYLES: Record<TestRunStatus, string> = {
  PASSED: "bg-green-500/10 text-green-400 border-green-500/20",
  FAILED: "bg-red-500/10 text-red-400 border-red-500/20",
  RUNNING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse",
};

function ExecutionStatusBadge({ status }: { status?: TestRunStatus | null }) {
  if (!status) {
    return (
      <span className="rounded-full px-2 py-0.5 text-xs font-medium border bg-slate-500/10 text-slate-400 border-slate-500/20">
        NO RUNS
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 text-xs font-medium border uppercase",
        EXECUTION_STATUS_STYLES[status]
      )}
    >
      {status}
    </span>
  );
}

// ─── Code view modal ──────────────────────────────────────────────────────────

function CodeModal({ file, onClose, isMockEntry = false }: { file: TestFileInfo; onClose: () => void; isMockEntry?: boolean }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    // Mock entries are served from in-memory data — no API call needed
    if (isMockEntry) {
      setCode(MOCK_CODE_MAP[file.relativePath] ?? "// Sample code not found");
      return;
    }
    fetch(`/api/tests/${encodeURIComponent(file.featureSlug)}/${encodeURIComponent(file.fileName)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCode(d.code))
      .catch(() => setCode("// Failed to load"));
  }, [file, isMockEntry]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
      <div className="w-full max-w-3xl h-[80vh] bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600 bg-surface-700">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-mono text-slate-200">{file.relativePath}</span>
          </div>
          <button onClick={onClose} className="px-3 py-1 text-xs text-slate-400 hover:text-white bg-surface-600 hover:bg-surface-500 rounded transition-colors">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {code === null
            ? <div className="flex items-center justify-center h-full text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
            : <pre className="text-xs font-mono text-slate-300 leading-5 whitespace-pre-wrap">{code}</pre>}
        </div>
      </div>
    </div>
  );
}

// ─── Feature History Card ─────────────────────────────────────────────────────

interface FeatureCardProps {
  group: FeatureGroup;
  onViewCode: (file: TestFileInfo, isMock: boolean) => void;
  onDeleteFeature: (slug: string) => void;
  isMock?: boolean;
}

function FeatureHistoryCard({ group, onViewCode, onDeleteFeature, isMock = false }: FeatureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { meta, tests } = group;

  return (
    <div className="rounded-xl border border-surface-600 overflow-hidden bg-surface-800/50 transition-all">
      {/* Card header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 sm:p-5 bg-surface-800/40">
        {/* Type icon + info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={clsx(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            meta.inputType === "swagger"
              ? "bg-violet-500/20 border border-violet-500/30"
              : "bg-sky-500/20 border border-sky-500/30"
          )}>
            {meta.inputType === "swagger"
              ? <Globe className="w-5 h-5 text-violet-400" />
              : <FileText className="w-5 h-5 text-sky-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-100">{meta.featureName}</h3>
              {isMock && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <FlaskConical className="w-2.5 h-2.5" aria-hidden />
                  Sample
                </span>
              )}
              <span className={clsx(
                "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border",
                meta.inputType === "swagger"
                  ? "bg-violet-500/15 text-violet-400 border-violet-500/20"
                  : "bg-sky-500/15 text-sky-400 border-sky-500/20"
              )}>
                {meta.inputType === "swagger" ? "API" : "UI"}
              </span>
              <ExecutionStatusBadge status={meta.latestRunStatus} />
            </div>

            {meta.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{meta.description}</p>
            )}

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-3 mt-2">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <CalendarDays className="w-3 h-3 flex-shrink-0" />
                {formatRelativeDate(meta.createdAt)}
              </span>
              <span className="hidden sm:inline text-slate-600 text-[10px]">{formatAbsoluteDate(meta.createdAt)}</span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Layers className="w-3 h-3 flex-shrink-0" />
                {tests.length} file{tests.length !== 1 ? "s" : ""}
              </span>
            </div>

            {meta.prdText && (
              <p className="text-[11px] text-slate-600 mt-2 font-mono bg-surface-700/50 px-2 py-1 rounded line-clamp-2">
                &ldquo;{meta.prdText}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => !isMock && onDeleteFeature(meta.slug)}
            disabled={isMock}
            title={isMock ? "Sample data cannot be deleted" : "Delete feature"}
            className={clsx(
              "p-2 rounded-lg transition-colors",
              isMock ? "text-slate-700 cursor-not-allowed" : "hover:bg-surface-600 text-slate-500 hover:text-red-400"
            )}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-surface-700/80 hover:bg-surface-700 transition-colors"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {expanded ? "Collapse" : "View Tests"}
          </button>
        </div>
      </div>

      {/* Expanded test list */}
      {expanded && (
        <div className="border-t border-surface-600 bg-surface-900/60 p-4 space-y-2 animate-fade-in">
          {tests.length === 0 ? (
            <EmptyState
              icon={FileCode2}
              accent="slate"
              title="No test files"
              description="This feature has no saved test files yet."
              compact
            />
          ) : (
            tests.map((file) => (
              <div
                key={file.relativePath}
                className="rounded-lg border border-surface-600 bg-surface-800 p-3"
              >
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="text-xs font-mono text-slate-200 flex-1 truncate">{file.fileName}</span>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onViewCode(file, isMock)}
                      title="View source code"
                      className="p-1 rounded hover:bg-surface-600 text-slate-500 hover:text-slate-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {!isMock && (
                      <button
                        onClick={() => routeRunToRepository(file)}
                        title="Run in Test Repository"
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded text-[10px] font-medium transition-colors"
                      >
                        <Play className="w-2.5 h-2.5 fill-white" />
                        Run
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-300 bg-red-500/15 border-red-500/30",
  high: "text-orange-300 bg-orange-500/15 border-orange-500/30",
  medium: "text-yellow-300 bg-yellow-500/15 border-yellow-500/30",
  low: "text-blue-300 bg-blue-500/15 border-blue-500/30",
  unknown: "text-slate-400 bg-slate-500/15 border-slate-500/30",
};

function LogAnalysisCard({
  analysis,
  onDelete,
}: {
  analysis: LogAnalysisRecord;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const severityClass = SEVERITY_COLORS[analysis.severity.toLowerCase()] ?? SEVERITY_COLORS.unknown;

  return (
    <div className="rounded-xl border border-surface-600 overflow-hidden bg-surface-800/50">
      <div className="flex items-start gap-4 p-5 bg-surface-800/40">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-violet-500/20 border border-violet-500/30">
          <BrainCircuit className="w-5 h-5 text-violet-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-100 capitalize">{analysis.source.replace(/-/g, " ")}</h3>
            <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border", severityClass)}>
              {analysis.severity}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-surface-700 text-slate-400 border border-surface-600">
              {analysis.category}
            </span>
          </div>
          <p className="text-sm text-slate-300 mt-1 line-clamp-2">{analysis.root_cause}</p>
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-2">
            <CalendarDays className="w-3 h-3" />
            {formatRelativeDate(analysis.created_at)}
            <span className="text-slate-600 text-[10px] ml-1">{formatAbsoluteDate(analysis.created_at)}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <button
            onClick={() => {
              if (!window.confirm("Delete this log analysis?")) return;
              onDelete(analysis.id);
            }}
            className="p-1 rounded hover:bg-surface-600 text-slate-600 hover:text-red-400 transition-colors"
            title="Delete analysis"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {expanded ? "Collapse" : "Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-600 bg-surface-900/60 p-5 space-y-4 animate-fade-in">
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Root Cause
            </p>
            <p className="text-sm text-slate-200">{analysis.root_cause}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <ScrollText className="w-3.5 h-3.5" /> Explanation
            </p>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{analysis.explanation}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5" /> Suggested Fix
            </p>
            <p className="text-sm text-emerald-300/90 whitespace-pre-wrap">{analysis.suggested_fix}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Original Logs</p>
            <pre className="text-[11px] font-mono text-slate-500 bg-surface-900 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
              {analysis.raw_logs.slice(0, 1500)}{analysis.raw_logs.length > 1500 ? "\n…" : ""}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function HistoryTab() {
  const [view, setView] = useState<HistoryView>("tests");
  const { features: realFeatures, isLoading, error, refresh, deleteFeature } = useTestRepository();
  const {
    analyses,
    isLoading: logsLoading,
    error: logsError,
    refresh: refreshLogs,
    deleteAnalysis,
  } = useLogHistory();
  const [codeViewFile, setCodeViewFile] = useState<{ file: TestFileInfo; isMock: boolean } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshLogs(); }, [refreshLogs]);

  useEffect(() => {
    const onChanged = () => {
      refresh();
      refreshLogs();
    };
    window.addEventListener("qa-genius:repository-changed", onChanged);
    window.addEventListener("qa-genius:test-runs-changed", onChanged);
    return () => {
      window.removeEventListener("qa-genius:repository-changed", onChanged);
      window.removeEventListener("qa-genius:test-runs-changed", onChanged);
    };
  }, [refresh, refreshLogs]);

  const showMockData = !isLoading && !error && realFeatures.length === 0;
  const features: FeatureGroup[] = showMockData ? MOCK_FEATURES : realFeatures;

  const filtered = features.filter(
    (g) =>
      !search.trim() ||
      g.meta.featureName.toLowerCase().includes(search.toLowerCase()) ||
      g.meta.description?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredLogs = analyses.filter(
    (a) =>
      !search.trim() ||
      a.source.toLowerCase().includes(search.toLowerCase()) ||
      a.root_cause.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase())
  );

  const totalTests = features.reduce((acc, g) => acc + g.tests.length, 0);
  const totalFeatures = features.length;
  const activeLoading = view === "tests" ? isLoading : logsLoading;
  const activeError = view === "tests" ? error : logsError;

  const handleRefresh = () => {
    if (view === "tests") refresh();
    else refreshLogs();
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <TabToolbar className="flex-col items-stretch sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1 bg-surface-900/80 rounded-lg p-1 border border-surface-600 flex-1 sm:flex-none">
            <button
              type="button"
              onClick={() => setView("tests")}
              className={clsx(
                "flex-1 sm:flex-none px-3 py-2 rounded-md text-xs font-medium transition-colors",
                view === "tests" ? "bg-surface-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              )}
            >
              Test History
            </button>
            <button
              type="button"
              onClick={() => setView("logs")}
              className={clsx(
                "flex-1 sm:flex-none px-3 py-2 rounded-md text-xs font-medium transition-colors",
                view === "logs" ? "bg-surface-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              )}
            >
              Log Analyses
            </button>
          </div>
          <SecondaryButton onClick={handleRefresh} disabled={activeLoading} className="sm:hidden flex-shrink-0">
            <RefreshCw className={clsx("w-3.5 h-3.5", activeLoading && "animate-spin")} />
          </SecondaryButton>
        </div>

        {view === "tests" && totalFeatures > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" aria-hidden />{totalFeatures} features</span>
            <span className="flex items-center gap-1"><FileCode2 className="w-3.5 h-3.5" aria-hidden />{totalTests} files</span>
          </div>
        )}

        {view === "logs" && analyses.length > 0 && (
          <span className="text-xs text-slate-400">{analyses.length} saved analyses</span>
        )}

        <div className="w-full sm:flex-1 sm:max-w-64 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <FormInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "tests" ? "Search features…" : "Search log analyses…"}
            className="pl-8 py-2 text-xs w-full"
          />
        </div>

        <SecondaryButton onClick={handleRefresh} disabled={activeLoading} className="hidden sm:flex ml-auto">
          <RefreshCw className={clsx("w-3.5 h-3.5", activeLoading && "animate-spin")} />
          Refresh
        </SecondaryButton>
      </TabToolbar>

      <TabContent className="space-y-4">
        {activeLoading && <LoadingState message="Loading history…" />}

        {!activeLoading && activeError && <ErrorBanner>{activeError}</ErrorBanner>}

        {view === "tests" && !activeLoading && (
          <>
            {showMockData && (
              <DemoBanner>
                <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                <span>
                  <strong>Demo Mode</strong> — sample features to showcase the UI.
                  Generate your first real test in the <strong>Test Generator</strong> tab to replace them.
                </span>
              </DemoBanner>
            )}

            {!activeLoading && filtered.length === 0 && features.length > 0 && (
              <EmptyState
                icon={Search}
                accent="slate"
                title="No matches found"
                description={`Nothing matches "${search}". Try a different search term.`}
              />
            )}

            {filtered.map((group) => (
              <FeatureHistoryCard
                key={group.meta.slug}
                group={group}
                isMock={showMockData}
                onViewCode={(file, isMock) => setCodeViewFile({ file, isMock })}
                onDeleteFeature={(slug) => {
                  const name = group.meta.featureName;
                  const count = group.tests.length;
                  if (!window.confirm(`Delete feature "${name}" and all ${count} test file(s)?\nThis cannot be undone.`)) return;
                  deleteFeature(slug);
                }}
              />
            ))}
          </>
        )}

        {view === "logs" && !activeLoading && (
          <>
            {filteredLogs.length === 0 && !logsError && (
              <EmptyState
                icon={BrainCircuit}
                accent="violet"
                title="No log analyses saved yet"
                description="Run an analysis in the Log Analyzer tab — results are saved here automatically for future reference."
                hint="Supports Playwright, Coralogix, Node.js, Jest, and Docker logs."
              />
            )}

            {filteredLogs.map((analysis) => (
              <LogAnalysisCard
                key={analysis.id}
                analysis={analysis}
                onDelete={deleteAnalysis}
              />
            ))}
          </>
        )}
      </TabContent>

      {codeViewFile && (
        <CodeModal
          file={codeViewFile.file}
          isMockEntry={codeViewFile.isMock}
          onClose={() => setCodeViewFile(null)}
        />
      )}
    </div>
  );
}
