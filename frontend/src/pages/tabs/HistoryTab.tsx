import { useEffect, useState, useCallback } from "react";
import {
  History, FileCode2, Globe, FileText, ChevronDown, ChevronRight,
  Loader2, Play, Eye, Trash2, RefreshCw, CalendarDays,
  CheckCircle2, XCircle, Layers, Search, FlaskConical,
  BrainCircuit, AlertTriangle, Wrench, ScrollText,
} from "lucide-react";
import clsx from "clsx";
import { useTestRepository } from "../../hooks/useTestRepository";
import { useLogHistory } from "../../hooks/useLogHistory";
import { FeatureGroup, LogAnalysisRecord, RunTestResult, TestFileInfo } from "../../types";
import { MOCK_FEATURES, MOCK_CODE_MAP } from "../../data/mockData";

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

// ─── Inline run hook ──────────────────────────────────────────────────────────

function useInlineRunner() {
  const [results, setResults] = useState<Record<string, RunTestResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});

  const run = useCallback(async (file: TestFileInfo) => {
    setRunning(file.relativePath);
    setOutputs((p) => ({ ...p, [file.relativePath]: "" }));

    try {
      const res = await fetch("/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ relativePath: file.relativePath }),
      });

      if (!res.body) throw new Error("No response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const chunk of events) {
          const lines = chunk.split("\n");
          const eventType = lines.find((l) => l.startsWith("event:"))?.replace("event: ", "");
          const dataLine = lines.find((l) => l.startsWith("data:"))?.replace("data: ", "");
          if (!eventType || !dataLine) continue;

          try {
            const data = JSON.parse(dataLine);
            if (eventType === "output") setOutputs((p) => ({ ...p, [file.relativePath]: (p[file.relativePath] ?? "") + data.text }));
            else if (eventType === "result") {
              setResults((p) => ({ ...p, [file.relativePath]: data as RunTestResult }));
              setOutputs((p) => ({ ...p, [file.relativePath]: data.output ?? "" }));
            }
          } catch { /**/ }
        }
      }
    } catch (e) {
      setOutputs((p) => ({ ...p, [file.relativePath]: `Error: ${e instanceof Error ? e.message : "Unknown"}` }));
    } finally {
      setRunning(null);
    }
  }, []);

  return { results, running, outputs, run };
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
  runner: ReturnType<typeof useInlineRunner>;
  onViewCode: (file: TestFileInfo, isMock: boolean) => void;
  onDeleteFeature: (slug: string) => void;
  isMock?: boolean;
}

function FeatureHistoryCard({ group, runner, onViewCode, onDeleteFeature, isMock = false }: FeatureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { meta, tests } = group;

  const passedCount = tests.filter((t) => runner.results[t.relativePath]?.status === "passed").length;
  const failedCount = tests.filter((t) => runner.results[t.relativePath]?.status === "failed").length;
  const hasRun = passedCount + failedCount > 0;

  return (
    <div className={clsx(
      "rounded-xl border overflow-hidden transition-all",
      hasRun && failedCount === 0 ? "border-emerald-500/20" : hasRun && failedCount > 0 ? "border-red-500/20" : "border-surface-600"
    )}>
      {/* Card header */}
      <div className="flex items-start gap-4 p-5 bg-surface-800">
        {/* Type icon */}
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

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-100">{meta.featureName}</h3>
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
              {meta.inputType === "swagger" ? "API Tests" : "UI Tests"}
            </span>
            {hasRun && (
              <div className="flex items-center gap-1.5 text-xs">
                {passedCount > 0 && <span className="flex items-center gap-0.5 text-emerald-400"><CheckCircle2 className="w-3 h-3" />{passedCount} passed</span>}
                {failedCount > 0 && <span className="flex items-center gap-0.5 text-red-400"><XCircle className="w-3 h-3" />{failedCount} failed</span>}
              </div>
            )}
          </div>

          {meta.description && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{meta.description}</p>
          )}

          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays className="w-3 h-3" />
              Created {formatRelativeDate(meta.createdAt)}
              <span className="text-slate-600 text-[10px] ml-1">{formatAbsoluteDate(meta.createdAt)}</span>
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Layers className="w-3 h-3" />
              {tests.length} test file{tests.length !== 1 ? "s" : ""}
            </span>
          </div>

          {meta.prdText && (
            <p className="text-[11px] text-slate-600 mt-2 font-mono bg-surface-700/50 px-2 py-1 rounded line-clamp-1">
              &ldquo;{meta.prdText}&rdquo;
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <button
            onClick={() => !isMock && onDeleteFeature(meta.slug)}
            disabled={isMock}
            title={isMock ? "Sample data cannot be deleted" : "Delete feature"}
            className={clsx(
              "p-1 rounded transition-colors",
              isMock ? "text-slate-700 cursor-not-allowed" : "hover:bg-surface-600 text-slate-600 hover:text-red-400"
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
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
            <p className="text-xs text-slate-600 text-center py-4">No test files found</p>
          ) : (
            tests.map((file) => {
              const result = runner.results[file.relativePath];
              const output = runner.outputs[file.relativePath];
              const isThisRunning = runner.running === file.relativePath;

              return (
                <div
                  key={file.relativePath}
                  className={clsx(
                    "rounded-lg border p-3 transition-all",
                    isThisRunning ? "border-sky-500/30 bg-sky-500/5"
                    : result?.status === "passed" ? "border-emerald-500/20 bg-emerald-500/5"
                    : result?.status === "failed" ? "border-red-500/20 bg-red-500/5"
                    : "border-surface-600 bg-surface-800"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isThisRunning ? <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin flex-shrink-0" />
                    : result?.status === "passed" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : result?.status === "failed" ? <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    : <FileCode2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}

                    <span className="text-xs font-mono text-slate-200 flex-1 truncate">{file.fileName}</span>

                    {result?.duration && (
                      <span className="text-[10px] text-slate-600 flex-shrink-0">
                        {(result.duration / 1000).toFixed(1)}s
                      </span>
                    )}

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
                          onClick={() => runner.run(file)}
                          disabled={!!runner.running}
                          title="Run test locally"
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white rounded text-[10px] font-medium transition-colors"
                        >
                          {isThisRunning ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5 fill-white" />}
                          Run
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline output snippet */}
                  {output && (
                    <div className="mt-2 bg-surface-900 rounded p-2 max-h-24 overflow-y-auto">
                      <pre className="text-[10px] font-mono leading-4 whitespace-pre-wrap">
                        {output.split("\n").map((line, i) => (
                          <span key={i} className={
                            /✓|passed/i.test(line) ? "text-emerald-400" :
                            /✗|failed|error/i.test(line) ? "text-red-400" : "text-slate-400"
                          }>{line + "\n"}</span>
                        ))}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
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
    <div className="rounded-xl border border-surface-600 overflow-hidden bg-surface-800">
      <div className="flex items-start gap-4 p-5">
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
  const runner = useInlineRunner();
  const [codeViewFile, setCodeViewFile] = useState<{ file: TestFileInfo; isMock: boolean } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshLogs(); }, [refreshLogs]);

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
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-3 border-b border-surface-600 bg-surface-800/30">
        <div className="flex items-center gap-1 bg-surface-900/80 rounded-lg p-1 border border-surface-600">
          <button
            type="button"
            onClick={() => setView("tests")}
            className={clsx(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "tests" ? "bg-surface-700 text-white" : "text-slate-400 hover:text-slate-200"
            )}
          >
            Test History
          </button>
          <button
            type="button"
            onClick={() => setView("logs")}
            className={clsx(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "logs" ? "bg-surface-700 text-white" : "text-slate-400 hover:text-slate-200"
            )}
          >
            Log Analyses
          </button>
        </div>

        {view === "tests" && totalFeatures > 0 && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" aria-hidden />{totalFeatures} features</span>
            <span className="flex items-center gap-1"><FileCode2 className="w-3.5 h-3.5" aria-hidden />{totalTests} test files</span>
          </div>
        )}

        {view === "logs" && analyses.length > 0 && (
          <span className="text-xs text-slate-400">{analyses.length} saved analyses</span>
        )}

        <div className="flex-1 max-w-64 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "tests" ? "Search features…" : "Search log analyses…"}
            className="w-full bg-surface-700 border border-surface-600 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <button
          onClick={handleRefresh}
          disabled={activeLoading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx("w-3.5 h-3.5", activeLoading && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {activeLoading && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        )}

        {!activeLoading && activeError && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-5 py-4">{activeError}</div>
        )}

        {view === "tests" && !activeLoading && (
          <>
            {showMockData && (
              <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400">
                <FlaskConical className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span>
                  <strong>Demo Mode</strong> — these are sample features to showcase the UI.
                  Generate your first real test in the <strong>Test Generator</strong> tab to replace them.
                </span>
              </div>
            )}

            {!activeLoading && filtered.length === 0 && features.length > 0 && (
              <p className="text-center text-slate-500 text-sm py-8">No features match &ldquo;{search}&rdquo;</p>
            )}

            {filtered.map((group) => (
              <FeatureHistoryCard
                key={group.meta.slug}
                group={group}
                runner={runner}
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
              <div className="text-center py-16 text-slate-500">
                <BrainCircuit className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No log analyses saved yet.</p>
                <p className="text-xs mt-1">Run an analysis in the <strong>Log Analyzer</strong> tab — it will appear here automatically.</p>
              </div>
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
      </div>

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
