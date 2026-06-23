import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, Play, Trash2, FileCode2, Loader2,
  CheckCircle2, XCircle, Clock, Terminal, FolderOpen,
  ChevronDown, ChevronRight, Globe, FileText, Eye, FlaskConical,
} from "lucide-react";
import clsx from "clsx";
import { useTestRepository } from "../../hooks/useTestRepository";
import { FeatureGroup, RunTestResult, TestFileInfo } from "../../types";
import { MOCK_FEATURES, MOCK_CODE_MAP } from "../../data/mockData";

function formatBytes(b: number) {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

interface FileRowProps {
  file: TestFileInfo;
  isRunning: boolean;
  result: RunTestResult | null;
  onRun: (file: TestFileInfo) => void;
  onDelete: (file: TestFileInfo) => void;
  onViewCode: (file: TestFileInfo) => void;
  isMock?: boolean;
}

function FileRow({ file, isRunning, result, onRun, onDelete, onViewCode, isMock = false }: FileRowProps) {
  return (
    <div className={clsx(
      "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all",
      isRunning
        ? "border-sky-500/30 bg-sky-500/5"
        : result?.status === "passed"
        ? "border-emerald-500/20 bg-emerald-500/5"
        : result?.status === "failed"
        ? "border-red-500/20 bg-red-500/5"
        : "border-surface-600 bg-surface-800/50 hover:border-surface-500"
    )}>
      {/* Status */}
      <div className="flex-shrink-0">
        {isRunning ? (
          <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
        ) : result?.status === "passed" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : result?.status === "failed" ? (
          <XCircle className="w-4 h-4 text-red-400" />
        ) : (
          <FileCode2 className="w-4 h-4 text-slate-500" />
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-slate-200 truncate">{file.fileName}</span>
          {result && (
            <span className={clsx(
              "text-[9px] font-bold px-1 rounded uppercase flex-shrink-0",
              result.status === "passed" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            )}>
              {result.status}
            </span>
          )}
          {result?.duration && (
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5 flex-shrink-0">
              <Clock className="w-2 h-2" />{(result.duration / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-600 truncate font-mono mt-0.5">
          {formatBytes(file.sizeBytes)} · {formatDate(file.modifiedAt)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onViewCode(file)}
          title="View code"
          className="p-1.5 rounded hover:bg-surface-600 text-slate-500 hover:text-slate-200 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        {!isMock && (
          <>
            <button
              onClick={() => onRun(file)}
              disabled={isRunning}
              title="Run test locally"
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 text-white rounded text-[10px] font-medium transition-colors"
            >
              {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-white" />}
              Run
            </button>
            <button
              onClick={() => onDelete(file)}
              title="Delete file"
              className="p-1.5 rounded hover:bg-surface-600 text-slate-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface FeatureCardProps {
  group: FeatureGroup;
  fileResults: Record<string, RunTestResult>;
  activeFile: string | null;
  isRunningFile: boolean;
  onRun: (file: TestFileInfo) => void;
  onDelete: (file: TestFileInfo) => void;
  onViewCode: (file: TestFileInfo) => void;
  onDeleteFeature: (slug: string) => void;
  isMock?: boolean;
}

function FeatureCard({
  group, fileResults, activeFile, isRunningFile, onRun, onDelete, onViewCode, onDeleteFeature, isMock = false,
}: FeatureCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { meta, tests } = group;

  const allPassed = tests.every((t) => fileResults[t.relativePath]?.status === "passed");
  const anyFailed = tests.some((t) => fileResults[t.relativePath]?.status === "failed");

  return (
    <div className={clsx(
      "rounded-xl border overflow-hidden transition-all",
      anyFailed ? "border-red-500/20" : allPassed ? "border-emerald-500/20" : "border-surface-600"
    )}>
      {/* Feature header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface-800 hover:bg-surface-700/80 transition-colors"
      >
        <div className={clsx(
          "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
          meta.inputType === "swagger"
            ? "bg-violet-500/20 border border-violet-500/30"
            : "bg-sky-500/20 border border-sky-500/30"
        )}>
          {meta.inputType === "swagger"
            ? <Globe className="w-3.5 h-3.5 text-violet-400" />
            : <FileText className="w-3.5 h-3.5 text-sky-400" />}
        </div>

        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-100 truncate">{meta.featureName}</p>
            {isMock && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
                <FlaskConical className="w-2 h-2" />
                Sample
              </span>
            )}
            <span className={clsx(
              "text-[9px] font-bold px-1.5 rounded uppercase flex-shrink-0",
              meta.inputType === "swagger"
                ? "bg-violet-500/15 text-violet-400 border border-violet-500/20"
                : "bg-sky-500/15 text-sky-400 border border-sky-500/20"
            )}>
              {meta.inputType === "swagger" ? "API" : "UI"}
            </span>
            <span className="text-[10px] text-slate-500 flex-shrink-0">
              {tests.length} test{tests.length !== 1 ? "s" : ""}
            </span>
          </div>
          {meta.description && (
            <p className="text-[10px] text-slate-600 truncate mt-0.5">{meta.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {anyFailed && <XCircle className="w-4 h-4 text-red-400" />}
          {allPassed && tests.length > 0 && !anyFailed && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {!isMock && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteFeature(meta.slug); }}
              title="Delete feature"
              className="p-1 rounded hover:bg-surface-600 text-slate-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {/* Test file list */}
      {expanded && (
        <div className="bg-surface-900/50 p-3 space-y-1.5 animate-fade-in">
          {tests.length === 0 ? (
            <p className="text-xs text-slate-600 px-2 py-2">No test files in this feature</p>
          ) : (
            tests.map((file) => (
              <FileRow
                key={file.relativePath}
                file={file}
                isRunning={isRunningFile && activeFile === file.relativePath}
                result={fileResults[file.relativePath] ?? null}
                onRun={onRun}
                onDelete={onDelete}
                onViewCode={onViewCode}
                isMock={isMock}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Code viewer modal ────────────────────────────────────────────────────────

function CodeModal({ file, onClose, isMock = false }: { file: TestFileInfo; onClose: () => void; isMock?: boolean }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (isMock) {
      setCode(MOCK_CODE_MAP[file.relativePath] ?? "// Sample code not available");
      return;
    }
    fetch(`/api/tests/${encodeURIComponent(file.featureSlug)}/${encodeURIComponent(file.fileName)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCode(d.code))
      .catch(() => setCode("// Failed to load"));
  }, [file, isMock]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
      <div className="w-full max-w-3xl h-[80vh] bg-surface-800 border border-surface-600 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600 bg-surface-700">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-mono text-slate-200">{file.relativePath}</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs text-slate-400 hover:text-white bg-surface-600 hover:bg-surface-500 rounded transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {code === null ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <pre className="text-xs font-mono text-slate-300 leading-5 whitespace-pre-wrap">{code}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function TestRepositoryTab() {
  const { features: realFeatures, isLoading, error, refresh, deleteTest, deleteFeature } = useTestRepository();

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileResults, setFileResults] = useState<Record<string, RunTestResult>>({});
  const [isRunningFile, setIsRunningFile] = useState(false);
  const [liveOutput, setLiveOutput] = useState("");
  const [liveProgress, setLiveProgress] = useState(0);
  const [liveStatus, setLiveStatus] = useState("");
  const [codeViewFile, setCodeViewFile] = useState<{ file: TestFileInfo; isMock: boolean } | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [liveOutput]);

  // Show mock data when no real tests exist yet
  const showMockData = !isLoading && !error && realFeatures.length === 0;
  const features: FeatureGroup[] = showMockData ? MOCK_FEATURES : realFeatures;

  const handleRun = async (file: TestFileInfo) => {
    setActiveFile(file.relativePath);
    setLiveOutput("");
    setLiveProgress(0);
    setLiveStatus("Initializing…");
    setIsRunningFile(true);

    try {
      const res = await fetch("/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ relativePath: file.relativePath }),
      });

      if (!res.body) throw new Error("No response body");
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
            if (eventType === "status") { setLiveStatus(data.message ?? ""); setLiveProgress(data.progress ?? 0); }
            else if (eventType === "output") setLiveOutput((p) => p + (data.text ?? ""));
            else if (eventType === "result") {
              setFileResults((p) => ({ ...p, [file.relativePath]: data as RunTestResult }));
              setLiveOutput(data.output ?? "");
              setLiveProgress(100);
            }
          } catch { /**/ }
        }
      }
    } catch (e) {
      setLiveOutput(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setIsRunningFile(false);
      setLiveStatus("");
    }
  };

  const handleDelete = (file: TestFileInfo) => {
    if (!window.confirm(`Delete "${file.fileName}"?\nThis cannot be undone.`)) return;
    deleteTest(file.featureSlug, file.fileName);
  };

  const handleDeleteFeature = (slug: string) => {
    const feature = features.find((f) => f.meta.slug === slug);
    const name = feature?.meta.featureName ?? slug;
    const count = feature?.tests.length ?? 0;
    if (!window.confirm(`Delete feature "${name}" and all ${count} test file(s)?\nThis cannot be undone.`)) return;
    deleteFeature(slug);
  };

  const totalTests = features.reduce((acc, f) => acc + f.tests.length, 0);
  const featuresLabel = showMockData ? "sample features" : "features";

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Feature tree panel ── */}
      <div className="w-[480px] flex-shrink-0 border-r border-surface-600 flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600 bg-surface-800/30">
          <div className="flex items-center gap-2">
            {features.length > 0 ? (
              <span className="text-xs bg-surface-600 text-slate-300 px-2 py-1 rounded-full">
                {features.length} {featuresLabel} · {totalTests} tests
              </span>
            ) : (
              <span className="text-xs text-slate-500">No saved tests yet</span>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1 text-xs text-slate-300 hover:text-white bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-3 h-3", isLoading && "animate-spin")} /> Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          )}
          {!isLoading && error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</div>
          )}
          {showMockData && (
            <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5 text-xs text-amber-400">
              <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
              <span><strong>Demo</strong> — sample test files. Generate real tests to replace them.</span>
            </div>
          )}
          {features.map((group) => (
            <FeatureCard
              key={group.meta.slug}
              group={group}
              fileResults={fileResults}
              activeFile={activeFile}
              isRunningFile={isRunningFile}
              onRun={handleRun}
              onDelete={handleDelete}
              onViewCode={(file) => setCodeViewFile({ file, isMock: showMockData })}
              onDeleteFeature={handleDeleteFeature}
              isMock={showMockData}
            />
          ))}
        </div>
      </div>

      {/* ── Live console ── */}
      <div className="flex-1 min-w-0 flex flex-col bg-surface-900">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600 bg-surface-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400 font-mono">Playwright Output</span>
            {activeFile && <span className="text-xs text-sky-400 font-mono">— {activeFile}</span>}
          </div>
          {isRunningFile && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-sky-400">{liveStatus}</span>
              <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
            </div>
          )}
        </div>

        {isRunningFile && (
          <div className="h-0.5 bg-surface-700">
            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${liveProgress}%` }} />
          </div>
        )}

        <div ref={consoleRef} className="flex-1 overflow-auto p-5 font-mono text-xs leading-5">
          {liveOutput ? (
            liveOutput.split("\n").map((line, i) => (
              <div key={i} className={
                /✓|passed|PASS/i.test(line) ? "text-emerald-400"
                : /✗|failed|FAIL|error/i.test(line) ? "text-red-400"
                : /warn/i.test(line) ? "text-yellow-400"
                : /^\s+at\s/.test(line) ? "text-slate-600"
                : "text-slate-300"
              }>
                {line || "\u00A0"}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-700 text-sm font-sans gap-2">
              <Terminal className="w-10 h-10 opacity-20" />
              <p>Select a test file and click "Run"</p>
            </div>
          )}
          {isRunningFile && <span className="inline-block w-2 h-3 bg-sky-400 animate-pulse mt-1" />}
        </div>
      </div>

      {/* Code viewer modal */}
      {codeViewFile && (
        <CodeModal
          file={codeViewFile.file}
          isMock={codeViewFile.isMock}
          onClose={() => setCodeViewFile(null)}
        />
      )}
    </div>
  );
}
