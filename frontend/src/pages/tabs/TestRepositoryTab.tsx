import { useEffect, useState } from "react";
import {
  RefreshCw, Play, Trash2, FileCode2, Loader2,
  Globe, FileText, FlaskConical,
  ChevronDown, ChevronRight, Search,
  ClipboardList, Eye, Download,
} from "lucide-react";
import clsx from "clsx";
import { useTestRepository } from "../../hooks/useTestRepository";
import { useManualStds } from "../../hooks/useManualStds";
import { FeatureGroup, TestFileInfo, ManualStdRecord } from "../../types";
import { MOCK_FEATURES, MOCK_CODE_MAP } from "../../data/mockData";
import { routeRunToGenerator } from "../../lib/cloudRunner";
import { exportStdToPdf } from "../../lib/exportStd";
import ManualStdTable from "../../components/qa-genius/ManualStdTable";
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

type RepoView = "automation" | "manual-std";

const REPO_TABS: { id: RepoView; label: string }[] = [
  { id: "automation", label: "🤖 Automation Suites" },
  { id: "manual-std", label: "📋 Manual STDs" },
];

const DOMAIN_LABELS: Record<string, string> = {
  fintech: "FinTech-Adaptive",
  auth: "Auth-Adaptive",
  gaming: "Gaming-Adaptive",
  general: "General",
};

const DOMAIN_STYLES: Record<string, string> = {
  fintech: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  auth: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  gaming: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  general: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

function formatBytes(b: number) {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

async function fetchTestCode(file: TestFileInfo, isMock: boolean): Promise<string> {
  if (isMock) return MOCK_CODE_MAP[file.relativePath] ?? "// Sample code not found";
  try {
    const res = await fetch(
      `/api/tests/${encodeURIComponent(file.featureSlug)}/${encodeURIComponent(file.fileName)}`,
      { credentials: "include" }
    );
    const d = await res.json();
    return d.code ?? "// Failed to load";
  } catch {
    return "// Failed to load test code";
  }
}

// ─── Code view modal ──────────────────────────────────────────────────────────

function CodeModal({ file, isMock, onClose }: { file: TestFileInfo; isMock: boolean; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    setCode(null);
    void fetchTestCode(file, isMock).then(setCode);
  }, [file, isMock]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
      <div className="w-full max-w-3xl h-[80vh] bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600 bg-surface-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-sm font-mono text-slate-200 truncate">{file.relativePath}</span>
          </div>
          <button onClick={onClose} className="px-3 py-1 text-xs text-slate-400 hover:text-white bg-surface-600 hover:bg-surface-500 rounded transition-colors flex-shrink-0">
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

// ─── Manual STD viewer modal ──────────────────────────────────────────────────

function ManualStdViewerModal({ std, onClose }: { std: ManualStdRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
      <div className="w-full max-w-6xl h-[85vh] bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-600 bg-surface-700 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="w-4 h-4 text-teal-400 flex-shrink-0" aria-hidden />
            <span className="text-sm font-mono text-slate-200 truncate">{std.feature_name}</span>
          </div>
          <button onClick={onClose} className="px-3 py-1 text-xs text-slate-400 hover:text-white bg-surface-600 hover:bg-surface-500 rounded transition-colors flex-shrink-0">
            Close
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden p-5 flex flex-col">
          <ManualStdTable
            testCases={std.test_cases}
            coverage={std.coverage}
            featureName={std.feature_name}
            domain={std.domain}
            model={std.model}
            isMock={std.is_mock}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Automation feature card ──────────────────────────────────────────────────

interface FeatureCardProps {
  group: FeatureGroup;
  onViewFile: (file: TestFileInfo, isMock: boolean) => void;
  onRunFile: (file: TestFileInfo, isMock: boolean) => void;
  onDeleteFile: (file: TestFileInfo) => void;
  onDeleteFeature: (slug: string) => void;
  isMock?: boolean;
  runningPath: string | null;
}

function FeatureCard({ group, onViewFile, onRunFile, onDeleteFile, onDeleteFeature, isMock = false, runningPath }: FeatureCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { meta, tests } = group;

  return (
    <div className="rounded-xl border overflow-hidden transition-all bg-surface-800/50 border-surface-600">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-800/60 transition-colors text-left cursor-pointer"
      >
        <div className={clsx(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
          meta.inputType === "swagger"
            ? "bg-violet-500/20 border border-violet-500/30"
            : "bg-sky-500/20 border border-sky-500/30"
        )}>
          {meta.inputType === "swagger"
            ? <Globe className="w-4 h-4 text-violet-400" />
            : <FileText className="w-4 h-4 text-sky-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{meta.featureName}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className={clsx(
              "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border",
              meta.inputType === "swagger"
                ? "bg-violet-500/15 text-violet-400 border-violet-500/20"
                : "bg-sky-500/15 text-sky-400 border-sky-500/20"
            )}>
              {meta.inputType === "swagger" ? "API" : "UI"}
            </span>
            <span className="text-[10px] text-slate-500">{tests.length} test file{tests.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isMock && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteFeature(meta.slug); }}
              title="Delete feature"
              className="p-1.5 rounded hover:bg-surface-600 text-slate-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="bg-surface-900/50 p-3 space-y-1.5 animate-fade-in border-t border-surface-600">
          {tests.length === 0 ? (
            <p className="text-xs text-slate-600 px-2 py-2">No test files in this feature</p>
          ) : (
            tests.map((file) => (
              <div
                key={file.relativePath}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-surface-600 bg-surface-800/50"
              >
                <FileCode2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-slate-200 truncate block">{file.fileName}</span>
                  <p className="text-[10px] text-slate-600 truncate font-mono mt-0.5">
                    {formatBytes(file.sizeBytes)} · {formatDate(file.modifiedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => onViewFile(file, isMock)}
                    title="View source code"
                    className="p-1.5 rounded hover:bg-surface-600 text-slate-500 hover:text-slate-200 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onRunFile(file, isMock)}
                    title="Run in Test Generator"
                    disabled={runningPath === file.relativePath}
                    className="p-1.5 rounded hover:bg-surface-600 text-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                  >
                    {runningPath === file.relativePath ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  {!isMock && (
                    <button
                      onClick={() => onDeleteFile(file)}
                      title="Delete file"
                      className="p-1.5 rounded hover:bg-surface-600 text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual STD card ──────────────────────────────────────────────────────────

interface ManualStdCardProps {
  std: ManualStdRecord;
  onView: (std: ManualStdRecord) => void;
  onDownload: (std: ManualStdRecord) => void;
  onDelete: (std: ManualStdRecord) => void;
  isDownloading: boolean;
}

function ManualStdCard({ std, onView, onDownload, onDelete, isDownloading }: ManualStdCardProps) {
  return (
    <div className="rounded-xl border border-surface-600 overflow-hidden bg-surface-800/50 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 sm:p-5 bg-surface-800/40">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-teal-500/20 border border-teal-500/30">
            <ClipboardList className="w-5 h-5 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-[280px]" title={std.feature_name}>
                {std.feature_name}
              </h3>
              {std.is_mock && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <FlaskConical className="w-2.5 h-2.5" aria-hidden />
                  Sample
                </span>
              )}
              {std.domain.split("+").map((d) => (
                <span
                  key={d}
                  className={clsx(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border",
                    DOMAIN_STYLES[d] ?? DOMAIN_STYLES.general
                  )}
                >
                  {DOMAIN_LABELS[d] ?? d}
                </span>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-3 mt-2 text-xs text-slate-500">
              <span>{formatDate(std.created_at)}</span>
              <span>{std.test_cases.length} test case{std.test_cases.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 flex-shrink-0 w-full sm:w-auto">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete(std)}
              title="Delete STD"
              className="p-2 rounded-lg hover:bg-surface-600 text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDownload(std)}
              disabled={isDownloading}
              title="Download PDF"
              className="p-2 rounded-lg hover:bg-surface-600 text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={() => onView(std)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-surface-700/80 hover:bg-surface-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function TestRepositoryTab() {
  const [view, setView] = useState<RepoView>("automation");
  const [search, setSearch] = useState("");
  const { features: realFeatures, isLoading, error, refresh, deleteTest, deleteFeature } = useTestRepository();
  const { stds, isLoading: stdsLoading, error: stdsError, refresh: refreshStds, deleteStd } = useManualStds();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [runningPath, setRunningPath] = useState<string | null>(null);
  const [codeViewFile, setCodeViewFile] = useState<{ file: TestFileInfo; isMock: boolean } | null>(null);
  const [viewingStd, setViewingStd] = useState<ManualStdRecord | null>(null);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshStds(); }, [refreshStds]);

  useEffect(() => {
    const onChanged = () => { refresh(); };
    const onStdsChanged = () => { refreshStds(); };
    window.addEventListener("qa-genius:repository-changed", onChanged);
    window.addEventListener("qa-genius:manual-std-changed", onStdsChanged);
    return () => {
      window.removeEventListener("qa-genius:repository-changed", onChanged);
      window.removeEventListener("qa-genius:manual-std-changed", onStdsChanged);
    };
  }, [refresh, refreshStds]);

  const showMockData = !isLoading && !error && realFeatures.length === 0;
  const features: FeatureGroup[] = showMockData ? MOCK_FEATURES : realFeatures;

  const filteredFeatures = features.filter(
    (g) => !search.trim() || g.meta.featureName.toLowerCase().includes(search.toLowerCase())
  );
  const filteredStds = stds.filter(
    (s) => !search.trim() || s.feature_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalTests = features.reduce((acc, f) => acc + f.tests.length, 0);
  const activeLoading = view === "automation" ? isLoading : stdsLoading;
  const activeError = view === "automation" ? error : stdsError;

  const handleRefresh = () => {
    if (view === "automation") refresh();
    else refreshStds();
  };

  const handleRunFile = async (file: TestFileInfo, isMock: boolean) => {
    setRunningPath(file.relativePath);
    try {
      const code = await fetchTestCode(file, isMock);
      const group = features.find((g) => g.meta.slug === file.featureSlug);
      routeRunToGenerator({ file, code, isMock, inputType: group?.meta.inputType, autoRun: true });
    } finally {
      setRunningPath(null);
    }
  };

  const handleDeleteFile = (file: TestFileInfo) => {
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

  const handleDownloadStd = async (std: ManualStdRecord) => {
    setDownloadingId(std.id);
    try {
      await exportStdToPdf(std.test_cases, std.coverage, std.feature_name, std.domain);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteStd = (std: ManualStdRecord) => {
    if (!window.confirm(`Delete STD "${std.feature_name}"?\nThis cannot be undone.`)) return;
    deleteStd(std.id);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <TabToolbar className="flex-col items-stretch sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 bg-surface-900/80 rounded-lg p-1 border border-surface-600 overflow-x-auto flex-shrink-0">
          {REPO_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={clsx(
                "px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                view === t.id ? "bg-surface-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {view === "automation" && features.length > 0 && (
            <span className="text-xs text-slate-400 flex-shrink-0">{features.length} features · {totalTests} tests</span>
          )}
          {view === "manual-std" && stds.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
              <ClipboardList className="w-3.5 h-3.5" aria-hidden />{stds.length} STDs
            </span>
          )}

          <div className="w-full sm:w-52 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <FormInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={view === "automation" ? "Search features…" : "Search STDs…"}
              className="pl-8 py-2 text-xs w-full"
            />
          </div>

          <SecondaryButton onClick={handleRefresh} disabled={activeLoading} className="flex-shrink-0">
            <RefreshCw className={clsx("w-3.5 h-3.5", activeLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </SecondaryButton>
        </div>
      </TabToolbar>

      <TabContent className="space-y-3">
        {activeLoading && <LoadingState message={view === "automation" ? "Loading tests…" : "Loading saved STDs…"} />}
        {!activeLoading && activeError && <ErrorBanner>{activeError}</ErrorBanner>}

        {view === "automation" && !activeLoading && (
          <>
            {showMockData && (
              <DemoBanner>
                <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span><strong>Demo</strong> — sample files for preview. Generate real tests in the Generator tab.</span>
              </DemoBanner>
            )}
            {filteredFeatures.length === 0 && (
              <EmptyState
                icon={search.trim() ? Search : FileCode2}
                accent="emerald"
                title={search.trim() ? "No matches found" : "No saved tests yet"}
                description={
                  search.trim()
                    ? `Nothing matches "${search}". Try a different search term.`
                    : "Generate a Playwright test in the Test Generator tab — it will appear here automatically."
                }
              />
            )}
            <div key="automation" className="space-y-3 animate-fade-in">
              {filteredFeatures.map((group) => (
                <FeatureCard
                  key={group.meta.slug}
                  group={group}
                  isMock={showMockData}
                  runningPath={runningPath}
                  onViewFile={(file, isMock) => setCodeViewFile({ file, isMock })}
                  onRunFile={handleRunFile}
                  onDeleteFile={handleDeleteFile}
                  onDeleteFeature={handleDeleteFeature}
                />
              ))}
            </div>
          </>
        )}

        {view === "manual-std" && !activeLoading && (
          <>
            {filteredStds.length === 0 && (
              <EmptyState
                icon={search.trim() ? Search : ClipboardList}
                accent="emerald"
                title={search.trim() ? "No matches found" : "No saved STDs yet"}
                description={
                  search.trim()
                    ? `Nothing matches "${search}". Try a different search term.`
                    : "Generate a Manual STD in the Test Generator tab — it will appear here automatically."
                }
              />
            )}
            <div key="manual-std" className="space-y-3 animate-fade-in">
              {filteredStds.map((std) => (
                <ManualStdCard
                  key={std.id}
                  std={std}
                  onView={setViewingStd}
                  onDownload={handleDownloadStd}
                  onDelete={handleDeleteStd}
                  isDownloading={downloadingId === std.id}
                />
              ))}
            </div>
          </>
        )}
      </TabContent>

      {codeViewFile && (
        <CodeModal
          file={codeViewFile.file}
          isMock={codeViewFile.isMock}
          onClose={() => setCodeViewFile(null)}
        />
      )}

      {viewingStd && (
        <ManualStdViewerModal std={viewingStd} onClose={() => setViewingStd(null)} />
      )}
    </div>
  );
}
