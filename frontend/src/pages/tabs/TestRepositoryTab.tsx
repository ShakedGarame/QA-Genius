import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, Play, Trash2, FileCode2, Loader2,
  CheckCircle2, XCircle, Clock, Terminal, Globe, FileText, FlaskConical,
  ChevronDown, ChevronRight,
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

async function simulateMockRun(
  file: TestFileInfo,
  onStatus: (msg: string, progress: number) => void,
  onOutput: (chunk: string) => void
): Promise<RunTestResult> {
  const steps: { delay: number; text: string; progress: number }[] = [
    { delay: 400, text: "☁️  Demo mode — simulated Playwright run\n", progress: 10 },
    { delay: 500, text: `⚡ npx playwright test ${file.fileName} --reporter=list\n`, progress: 25 },
    { delay: 600, text: "\nRunning 2 tests using 1 worker\n\n", progress: 40 },
    { delay: 700, text: "  ✓  TC-001: renders without errors (1.2s)\n", progress: 65 },
    { delay: 800, text: "  ✓  TC-002: meets acceptance criteria (0.9s)\n\n", progress: 85 },
    { delay: 400, text: "  2 passed (2.5s)\n", progress: 100 },
  ];

  let output = "";
  for (const step of steps) {
    onStatus(`Running ${file.fileName}…`, step.progress);
    await new Promise((r) => setTimeout(r, step.delay));
    output += step.text;
    onOutput(step.text);
  }

  return {
    testId: `mock-${file.relativePath}`,
    status: "passed",
    output,
    duration: 2500,
  };
}

interface FileRowProps {
  file: TestFileInfo;
  isSelected: boolean;
  isRunning: boolean;
  result: RunTestResult | null;
  onSelect: (file: TestFileInfo) => void;
  onDelete: (file: TestFileInfo) => void;
  isMock?: boolean;
}

function FileRow({ file, isSelected, isRunning, result, onSelect, onDelete, isMock = false }: FileRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(file)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(file); } }}
      className={clsx(
        "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-pointer",
        isSelected ? "border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30"
        : isRunning ? "border-sky-500/30 bg-sky-500/5"
        : result?.status === "passed" ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/30"
        : result?.status === "failed" ? "border-red-500/20 bg-red-500/5 hover:border-red-500/30"
        : "border-surface-600 bg-surface-800/50 hover:border-surface-500"
      )}
    >
      <div className="flex-shrink-0">
        {isRunning ? <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
        : result?.status === "passed" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        : result?.status === "failed" ? <XCircle className="w-4 h-4 text-red-400" />
        : <FileCode2 className="w-4 h-4 text-slate-500" />}
      </div>

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

      {!isMock && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(file); }}
          title="Delete file"
          className="p-1.5 rounded hover:bg-surface-600 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

interface FeatureCardProps {
  group: FeatureGroup;
  selectedPath: string | null;
  fileResults: Record<string, RunTestResult>;
  runningPath: string | null;
  onSelect: (file: TestFileInfo) => void;
  onDelete: (file: TestFileInfo) => void;
  onDeleteFeature: (slug: string) => void;
  isMock?: boolean;
}

function FeatureCard({
  group, selectedPath, fileResults, runningPath, onSelect, onDelete, onDeleteFeature, isMock = false,
}: FeatureCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { meta, tests } = group;

  const allPassed = tests.every((t) => fileResults[t.relativePath]?.status === "passed");
  const anyFailed = tests.some((t) => fileResults[t.relativePath]?.status === "failed");

  return (
    <div className={clsx(
      "rounded-xl border overflow-hidden transition-all",
      anyFailed ? "border-red-500/20" : allPassed && tests.length > 0 ? "border-emerald-500/20" : "border-surface-600"
    )}>
      <button
        type="button"
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
              type="button"
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

      {expanded && (
        <div className="bg-surface-900/50 p-3 space-y-1.5 animate-fade-in">
          {tests.length === 0 ? (
            <p className="text-xs text-slate-600 px-2 py-2">No test files in this feature</p>
          ) : (
            tests.map((file) => (
              <FileRow
                key={file.relativePath}
                file={file}
                isSelected={selectedPath === file.relativePath}
                isRunning={runningPath === file.relativePath}
                result={fileResults[file.relativePath] ?? null}
                onSelect={onSelect}
                onDelete={onDelete}
                isMock={isMock}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TestRepositoryTab() {
  const { features: realFeatures, isLoading, error, refresh, deleteTest, deleteFeature } = useTestRepository();

  const [selectedTest, setSelectedTest] = useState<{ file: TestFileInfo; isMock: boolean } | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fileResults, setFileResults] = useState<Record<string, RunTestResult>>({});
  const [runningPath, setRunningPath] = useState<string | null>(null);
  const [liveOutput, setLiveOutput] = useState("");
  const [liveProgress, setLiveProgress] = useState(0);
  const [liveStatus, setLiveStatus] = useState("");
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onChanged = () => { refresh(); };
    window.addEventListener("qa-genius:repository-changed", onChanged);
    return () => window.removeEventListener("qa-genius:repository-changed", onChanged);
  }, [refresh]);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [liveOutput]);

  useEffect(() => {
    if (!selectedTest) {
      setPreviewCode(null);
      return;
    }

    const { file, isMock } = selectedTest;
    if (isMock) {
      setPreviewCode(MOCK_CODE_MAP[file.relativePath] ?? "// Sample code not available");
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    fetch(
      `/api/tests/${encodeURIComponent(file.featureSlug)}/${encodeURIComponent(file.fileName)}`,
      { credentials: "include" }
    )
      .then((r) => r.json())
      .then((d) => setPreviewCode(d.code ?? "// Failed to load"))
      .catch(() => setPreviewCode("// Failed to load test code"))
      .finally(() => setPreviewLoading(false));
  }, [selectedTest]);

  const showMockData = !isLoading && !error && realFeatures.length === 0;
  const features: FeatureGroup[] = showMockData ? MOCK_FEATURES : realFeatures;

  const handleSelect = useCallback((file: TestFileInfo) => {
    setSelectedTest({ file, isMock: showMockData });
    setLiveOutput("");
    setLiveProgress(0);
    setLiveStatus("");
  }, [showMockData]);

  const handleRun = useCallback(async () => {
    if (!selectedTest) return;
    const { file, isMock } = selectedTest;

    setRunningPath(file.relativePath);
    setLiveOutput("");
    setLiveProgress(0);
    setLiveStatus("Initializing…");

    try {
      if (isMock) {
        const result = await simulateMockRun(
          file,
          (msg, progress) => { setLiveStatus(msg); setLiveProgress(progress); },
          (chunk) => setLiveOutput((p) => p + chunk)
        );
        setFileResults((p) => ({ ...p, [file.relativePath]: result }));
        setLiveProgress(100);
        return;
      }

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
            if (eventType === "status") {
              setLiveStatus(data.message ?? "");
              setLiveProgress(data.progress ?? 0);
            } else if (eventType === "output") {
              setLiveOutput((p) => p + (data.text ?? ""));
            } else if (eventType === "result") {
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
      setRunningPath(null);
      setLiveStatus("");
    }
  }, [selectedTest]);

  const handleDelete = (file: TestFileInfo) => {
    if (!window.confirm(`Delete "${file.fileName}"?\nThis cannot be undone.`)) return;
    deleteTest(file.featureSlug, file.fileName);
    if (selectedTest?.file.relativePath === file.relativePath) {
      setSelectedTest(null);
    }
  };

  const handleDeleteFeature = (slug: string) => {
    const feature = features.find((f) => f.meta.slug === slug);
    const name = feature?.meta.featureName ?? slug;
    const count = feature?.tests.length ?? 0;
    if (!window.confirm(`Delete feature "${name}" and all ${count} test file(s)?\nThis cannot be undone.`)) return;
    deleteFeature(slug);
    if (selectedTest?.file.featureSlug === slug) setSelectedTest(null);
  };

  const totalTests = features.reduce((acc, f) => acc + f.tests.length, 0);
  const featuresLabel = showMockData ? "sample features" : "features";
  const isRunning = runningPath !== null;
  const selectedResult = selectedTest ? fileResults[selectedTest.file.relativePath] ?? null : null;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Feature tree ── */}
      <div className="w-[420px] flex-shrink-0 border-r border-surface-600 flex flex-col">
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
            type="button"
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
              <span><strong>Demo</strong> — sample files for preview. Generate real tests in the Generator tab.</span>
            </div>
          )}
          {features.map((group) => (
            <FeatureCard
              key={group.meta.slug}
              group={group}
              selectedPath={selectedTest?.file.relativePath ?? null}
              fileResults={fileResults}
              runningPath={runningPath}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onDeleteFeature={handleDeleteFeature}
              isMock={showMockData}
            />
          ))}
        </div>
      </div>

      {/* ── Preview + Run + Console ── */}
      <div className="flex-1 min-w-0 flex flex-col bg-surface-900">
        {!selectedTest ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
            <FileCode2 className="w-12 h-12 opacity-20" />
            <p className="text-sm">Select a test file from the list on the left</p>
          </div>
        ) : (
          <>
            {/* Header + Run button */}
            <div className="flex-shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b border-surface-600 bg-surface-800">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100 truncate">{selectedTest.file.fileName}</p>
                <p className="text-[11px] font-mono text-slate-500 truncate">{selectedTest.file.relativePath}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedResult && (
                  <span className={clsx(
                    "text-[10px] font-bold px-2 py-1 rounded uppercase",
                    selectedResult.status === "passed" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                  )}>
                    {selectedResult.status}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isRunning}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-lg shadow-emerald-900/30 transition-all"
                >
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                  {isRunning ? "Running…" : "Run Test"}
                </button>
              </div>
            </div>

            {/* Code preview */}
            <div className="flex-shrink-0 h-[38%] min-h-[160px] border-b border-surface-600 flex flex-col">
              <div className="flex items-center gap-2 px-5 py-2 bg-surface-800/60 border-b border-surface-700">
                <FileCode2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">Source Preview</span>
                {selectedTest.isMock && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Sample</span>
                )}
              </div>
              <div className="flex-1 overflow-auto p-4 bg-surface-950/50">
                {previewLoading ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading code…
                  </div>
                ) : (
                  <pre className="text-[11px] font-mono text-slate-300 leading-5 whitespace-pre-wrap">{previewCode}</pre>
                )}
              </div>
            </div>

            {/* Terminal output */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between px-5 py-2 border-b border-surface-700 bg-surface-800/40">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-400 font-mono">Playwright Output</span>
                </div>
                {isRunning && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-sky-400">{liveStatus}</span>
                    <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                  </div>
                )}
              </div>

              {isRunning && (
                <div className="h-0.5 bg-surface-700 flex-shrink-0">
                  <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${liveProgress}%` }} />
                </div>
              )}

              <div ref={consoleRef} className="flex-1 overflow-auto p-4 font-mono text-xs leading-5">
                {liveOutput ? (
                  liveOutput.split("\n").map((line, i) => (
                    <div
                      key={i}
                      className={
                        /✓|passed|PASS/i.test(line) ? "text-emerald-400"
                        : /✗|failed|FAIL|error/i.test(line) ? "text-red-400"
                        : /warn|⚠/i.test(line) ? "text-yellow-400"
                        : /^\s+at\s/.test(line) ? "text-slate-600"
                        : "text-slate-300"
                      }
                    >
                      {line || "\u00A0"}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
                    <Terminal className="w-8 h-8 opacity-20" />
                    <p>Click <strong className="text-slate-400">Run Test</strong> to start execution</p>
                  </div>
                )}
                {isRunning && <span className="inline-block w-2 h-3 bg-sky-400 animate-pulse mt-1" />}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
