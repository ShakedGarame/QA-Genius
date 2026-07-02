import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, Play, Trash2, FileCode2, Loader2,
  Globe, FileText, FlaskConical,
  ChevronDown, ChevronRight, ExternalLink, ArrowLeft,
} from "lucide-react";
import clsx from "clsx";
import { useTestRepository } from "../../hooks/useTestRepository";
import { FeatureGroup, TestFileInfo } from "../../types";
import { MOCK_FEATURES, MOCK_CODE_MAP } from "../../data/mockData";
import { routeRunToGenerator } from "../../lib/cloudRunner";
import {
  SidebarPanel,
  PanelHeader,
  PanelBody,
  EmptyState,
  LoadingState,
  DemoBanner,
  ErrorBanner,
  SecondaryButton,
} from "../../components/ui/layout";

function formatBytes(b: number) {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

interface FileRowProps {
  file: TestFileInfo;
  isSelected: boolean;
  onSelect: (file: TestFileInfo) => void;
  onDelete: (file: TestFileInfo) => void;
  isMock?: boolean;
}

function FileRow({ file, isSelected, onSelect, onDelete, isMock = false }: FileRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(file)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(file); } }}
      className={clsx(
        "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30"
          : "border-surface-600 bg-surface-800/50 hover:border-surface-500"
      )}
    >
      <FileCode2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-mono text-slate-200 truncate block">{file.fileName}</span>
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
  onSelect: (file: TestFileInfo) => void;
  onDelete: (file: TestFileInfo) => void;
  onDeleteFeature: (slug: string) => void;
  isMock?: boolean;
}

function FeatureCard({
  group, selectedPath, onSelect, onDelete, onDeleteFeature, isMock = false,
}: FeatureCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { meta, tests } = group;

  return (
    <div className="rounded-xl border overflow-hidden transition-all bg-surface-800/50 border-surface-600">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-800/60 transition-colors text-left cursor-pointer"
      >
        <div className={clsx(
          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
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
          <p className="text-[10px] text-slate-500 mt-0.5">{tests.length} test file{tests.length !== 1 ? "s" : ""}</p>
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
              <FileRow
                key={file.relativePath}
                file={file}
                isSelected={selectedPath === file.relativePath}
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

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onChanged = () => { refresh(); };
    window.addEventListener("qa-genius:repository-changed", onChanged);
    return () => window.removeEventListener("qa-genius:repository-changed", onChanged);
  }, [refresh]);

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
  }, [showMockData]);

  const handleClearSelection = useCallback(() => {
    setSelectedTest(null);
  }, []);

  const handleRunInGenerator = useCallback(() => {
    if (!selectedTest || previewLoading || !previewCode) return;
    const { file, isMock } = selectedTest;
    const group = features.find((g) => g.meta.slug === file.featureSlug);
    routeRunToGenerator({
      file,
      code: previewCode,
      isMock,
      inputType: group?.meta.inputType,
      autoRun: true,
    });
  }, [selectedTest, previewLoading, previewCode, features]);

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

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
      <SidebarPanel
        width="lg:w-[420px]"
        mobileExpanded={!selectedTest}
        className={clsx(selectedTest && "hidden lg:flex", !selectedTest && "flex-1 lg:flex-none")}
      >
        <PanelHeader>
          <div className="flex items-center gap-2 min-w-0">
            {features.length > 0 ? (
              <span className="text-xs bg-surface-700 text-slate-300 px-2.5 py-1 rounded-full border border-surface-600">
                {features.length} {featuresLabel} · {totalTests} tests
              </span>
            ) : (
              <span className="text-xs text-slate-500">No saved tests yet</span>
            )}
          </div>
          <SecondaryButton onClick={refresh} disabled={isLoading}>
            <RefreshCw className={clsx("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh
          </SecondaryButton>
        </PanelHeader>

        <PanelBody>
          {isLoading && <LoadingState message="Loading tests…" />}
          {!isLoading && error && <ErrorBanner>{error}</ErrorBanner>}
          {showMockData && (
            <DemoBanner>
              <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span><strong>Demo</strong> — sample files for preview. Generate real tests in the Generator tab.</span>
            </DemoBanner>
          )}
          {features.map((group) => (
            <FeatureCard
              key={group.meta.slug}
              group={group}
              selectedPath={selectedTest?.file.relativePath ?? null}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onDeleteFeature={handleDeleteFeature}
              isMock={showMockData}
            />
          ))}
        </PanelBody>
      </SidebarPanel>

      <div className={clsx("qa-main-pane flex flex-col flex-1 min-h-0", !selectedTest && "hidden lg:flex")}>
        {!selectedTest ? (
          <div className="hidden lg:flex flex-1">
            <EmptyState
              icon={FileCode2}
              accent="emerald"
              title="Select a test to preview"
              description="Choose a test file from the list on the left to view its source code."
              hint='Click "Run Test" to open Test Generator and execute with the full-width terminal.'
            />
          </div>
        ) : (
          <>
            <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-surface-600 bg-surface-800/40">
              <div className="flex items-start gap-2 min-w-0">
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="lg:hidden flex-shrink-0 p-2 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-surface-700 transition-colors"
                  aria-label="Back to test list"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{selectedTest.file.fileName}</p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">{selectedTest.file.relativePath}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunInGenerator}
                disabled={previewLoading || !previewCode}
                className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-lg shadow-emerald-900/30 transition-all w-full sm:w-auto"
              >
                {previewLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </>
                )}
                {previewLoading ? "Loading…" : "Run Test"}
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 px-5 py-2 border-b border-surface-700 bg-surface-800/40">
                <FileCode2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">Source Preview</span>
                {selectedTest.isMock && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Sample</span>
                )}
              </div>
              <div className="flex-1 overflow-auto p-5 bg-surface-950/50">
                {previewLoading ? (
                  <LoadingState message="Loading code…" />
                ) : (
                  <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">{previewCode}</pre>
                )}
              </div>
            </div>

            <p className="flex-shrink-0 px-5 py-2 text-[11px] text-slate-500 border-t border-surface-700 bg-surface-900/50">
              Runs open in <strong className="text-slate-400">Test Generator</strong> for full terminal width, screenshots, and AI failure analysis.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
