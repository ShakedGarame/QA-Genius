import { useEffect, useState } from "react";
import {
  RefreshCw, Play, Trash2, FileCode2,
  Globe, FileText, FlaskConical,
  ChevronRight, Search, Bot,
  ClipboardList, Eye, Share2,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useTestRepository } from "../../hooks/useTestRepository";
import { useManualStds } from "../../hooks/useManualStds";
import { FeatureGroup, TestFileInfo, ManualStdRecord } from "../../types";
import { MOCK_FEATURES } from "../../data/mockData";
import { routeRunToGenerator } from "../../lib/cloudRunner";
import { exportStdToPdf } from "../../lib/exportStd";
import { formatAbsoluteDate, formatRelativeDate } from "../../lib/formatDuration";
import ManualStdViewerModal from "../../components/qa-genius/ManualStdViewerModal";
import ShowcaseModal from "../../components/qa-genius/ShowcaseModal";
import CodeViewerModal, { fetchTestCode } from "../../components/qa-genius/CodeViewerModal";
import ManualStdCard from "../../components/qa-genius/ManualStdCard";
import {
  TabToolbar,
  TabContent,
  EmptyState,
  SkeletonCardList,
  DemoBanner,
  ErrorBanner,
  SecondaryButton,
  FormInput,
  SegmentedControl,
  IconButton,
  Badge,
  FOCUS_RING,
} from "../../components/ui/layout";

type RepoView = "automation" | "manual-std";

function formatBytes(b: number) {
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}

// ─── Automation feature card ──────────────────────────────────────────────────

interface FeatureCardProps {
  group: FeatureGroup;
  onViewFile: (file: TestFileInfo, isMock: boolean) => void;
  onRunFile: (file: TestFileInfo, isMock: boolean) => void;
  onDeleteFile: (file: TestFileInfo) => void;
  onDeleteFeature: (slug: string) => void;
  onShareFile: (file: TestFileInfo) => void;
  isMock?: boolean;
  runningPath: string | null;
}

function FeatureCard({ group, onViewFile, onRunFile, onDeleteFile, onDeleteFeature, onShareFile, isMock = false, runningPath }: FeatureCardProps) {
  const [expanded, setExpanded] = useState(true);
  const { meta, tests } = group;
  const isApi = meta.inputType === "swagger";
  const panelId = `feature-files-${meta.slug}`;

  return (
    <article className="rounded-xl border border-surface-700 bg-surface-800/50 overflow-hidden transition-colors hover:border-surface-600">
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={clsx(
            "flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left rounded-xl",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/70"
          )}
        >
          <ChevronRight
            className={clsx(
              "w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ease-out",
              expanded && "rotate-90"
            )}
            aria-hidden
          />
          <div className={clsx(
            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border",
            isApi ? "bg-violet-500/10 border-violet-500/20" : "bg-sky-500/10 border-sky-500/20"
          )}>
            {isApi
              ? <Globe className="w-4 h-4 text-violet-400" aria-hidden />
              : <FileText className="w-4 h-4 text-sky-400" aria-hidden />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{meta.featureName}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge tone={isApi ? "accent" : "info"}>{isApi ? "API" : "UI"}</Badge>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {tests.length} test file{tests.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </button>
        {!isMock && (
          <IconButton icon={Trash2} label={`Delete feature ${meta.featureName}`} tone="danger" onClick={() => onDeleteFeature(meta.slug)} />
        )}
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-surface-700 bg-surface-900/40 p-2 animate-fade-in">
          {tests.length === 0 ? (
            <p className="text-xs text-slate-500 px-3 py-2">No test files in this feature</p>
          ) : (
            <ul className="space-y-0.5">
              {tests.map((file) => {
                const running = runningPath === file.relativePath;
                return (
                  <li
                    key={file.relativePath}
                    className="group flex items-center gap-3 pl-3 pr-1.5 py-1.5 rounded-lg transition-colors hover:bg-surface-800/80"
                  >
                    <FileCode2 className="w-4 h-4 text-slate-500 flex-shrink-0" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => onViewFile(file, isMock)}
                        className={clsx("block max-w-full text-left text-xs font-mono text-slate-200 hover:text-white truncate rounded", FOCUS_RING)}
                        title={file.fileName}
                      >
                        {file.fileName}
                      </button>
                      <p className="text-[11px] text-slate-500 truncate tabular-nums mt-0.5" title={formatAbsoluteDate(file.modifiedAt)}>
                        {formatBytes(file.sizeBytes)} · {formatRelativeDate(file.modifiedAt)}
                      </p>
                    </div>
                    {/* Secondary actions stay quiet until the row is hovered/focused;
                        Run keeps full contrast since it's the primary action. */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <div className="flex items-center gap-0.5 transition-opacity duration-150 [@media(hover:hover)]:opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
                        <IconButton icon={Eye} label="View source" size="sm" onClick={() => onViewFile(file, isMock)} />
                        {!isMock && (
                          <IconButton icon={Share2} label="Share showcase link" size="sm" tone="accent" onClick={() => onShareFile(file)} />
                        )}
                        {!isMock && (
                          <IconButton icon={Trash2} label={`Delete ${file.fileName}`} size="sm" tone="danger" onClick={() => onDeleteFile(file)} />
                        )}
                      </div>
                      <IconButton
                        icon={Play}
                        label="Run in Test Generator"
                        size="sm"
                        tone="success"
                        loading={running}
                        onClick={() => onRunFile(file, isMock)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </article>
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
  const [sharingFile, setSharingFile] = useState<TestFileInfo | null>(null);

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

  const query = search.trim().toLowerCase();
  const filteredFeatures = features.filter((g) => !query || g.meta.featureName.toLowerCase().includes(query));
  const filteredStds = stds.filter((s) => !query || s.feature_name.toLowerCase().includes(query));

  const totalTests = features.reduce((acc, f) => acc + f.tests.length, 0);
  const activeLoading = view === "automation" ? isLoading : stdsLoading;
  const activeError = view === "automation" ? error : stdsError;
  // Only the very first load shows skeletons — background refreshes (fired by
  // cross-tab change events) keep the current list on screen instead of
  // flashing it away.
  const showSkeleton = activeLoading && (view === "automation" ? realFeatures.length === 0 : stds.length === 0);

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

  const handleDeleteFile = async (file: TestFileInfo) => {
    if (!window.confirm(`Delete "${file.fileName}"?\nThis cannot be undone.`)) return;
    const ok = await deleteTest(file.featureSlug, file.fileName);
    if (ok) toast.success(`Deleted ${file.fileName}`);
    else toast.error(`Couldn't delete ${file.fileName}`, { description: "The file was restored. Try again." });
  };

  const handleDeleteFeature = async (slug: string) => {
    const feature = features.find((f) => f.meta.slug === slug);
    const name = feature?.meta.featureName ?? slug;
    const count = feature?.tests.length ?? 0;
    if (!window.confirm(`Delete feature "${name}" and all ${count} test file(s)?\nThis cannot be undone.`)) return;
    const ok = await deleteFeature(slug);
    if (ok) toast.success(`Deleted ${name}`, { description: `${count} test file${count !== 1 ? "s" : ""} removed` });
    else toast.error(`Couldn't delete ${name}`, { description: "The feature was restored. Try again." });
  };

  const handleDownloadStd = async (std: ManualStdRecord) => {
    setDownloadingId(std.id);
    try {
      await exportStdToPdf(std.test_cases, std.coverage, std.feature_name, std.domain);
    } catch {
      toast.error("PDF export failed");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteStd = async (std: ManualStdRecord) => {
    if (!window.confirm(`Delete STD "${std.feature_name}"?\nThis cannot be undone.`)) return;
    const ok = await deleteStd(std.id);
    if (ok) toast.success(`Deleted ${std.feature_name}`);
    else toast.error(`Couldn't delete ${std.feature_name}`, { description: "The STD was restored. Try again." });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <TabToolbar className="flex-col items-stretch sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<RepoView>
          ariaLabel="Repository view"
          fullWidth="mobile"
          value={view}
          onChange={setView}
          options={[
            { id: "automation", label: "Automation Suites", icon: Bot, count: realFeatures.length || undefined },
            { id: "manual-std", label: "Manual STDs", icon: ClipboardList, count: stds.length || undefined },
          ]}
        />

        <div className="flex items-center gap-2 sm:gap-3">
          {view === "automation" && features.length > 0 && (
            <span className="hidden md:inline text-xs text-slate-500 tabular-nums flex-shrink-0">
              {totalTests} test file{totalTests !== 1 ? "s" : ""}
            </span>
          )}

          <div className="flex-1 min-w-0 sm:flex-none sm:w-56 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" aria-hidden />
            <FormInput
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={view === "automation" ? "Search features…" : "Search STDs…"}
              aria-label={view === "automation" ? "Search features" : "Search STDs"}
              className="pl-8 sm:py-1.5 h-8 text-xs"
            />
          </div>

          <SecondaryButton onClick={handleRefresh} disabled={activeLoading} className="flex-shrink-0" aria-label="Refresh">
            <RefreshCw className={clsx("w-3.5 h-3.5", activeLoading && "animate-spin")} aria-hidden />
            <span className="hidden sm:inline">Refresh</span>
          </SecondaryButton>
        </div>
      </TabToolbar>

      <TabContent className="space-y-3">
        {showSkeleton && <SkeletonCardList label={view === "automation" ? "Loading tests" : "Loading saved STDs"} />}
        {!activeLoading && activeError && <ErrorBanner>{activeError}</ErrorBanner>}

        {view === "automation" && !showSkeleton && (
          <>
            {showMockData && (
              <DemoBanner>
                <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                <span><strong className="font-semibold">Demo</strong> — sample files for preview. Generate real tests in the Generator tab.</span>
              </DemoBanner>
            )}
            {filteredFeatures.length === 0 && !activeLoading && (
              <EmptyState
                icon={query ? Search : FileCode2}
                accent="emerald"
                title={query ? "No matches found" : "No saved tests yet"}
                description={
                  query
                    ? `Nothing matches "${search}". Try a different search term.`
                    : "Generate a Playwright test in the Test Generator tab — it will appear here automatically."
                }
              />
            )}
            <div key="automation" className="space-y-3">
              {filteredFeatures.map((group, i) => (
                <div key={group.meta.slug} className="animate-slide-up" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
                  <FeatureCard
                    group={group}
                    isMock={showMockData}
                    runningPath={runningPath}
                    onViewFile={(file, isMock) => setCodeViewFile({ file, isMock })}
                    onRunFile={handleRunFile}
                    onDeleteFile={handleDeleteFile}
                    onDeleteFeature={handleDeleteFeature}
                    onShareFile={setSharingFile}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {view === "manual-std" && !showSkeleton && (
          <>
            {filteredStds.length === 0 && !activeLoading && (
              <EmptyState
                icon={query ? Search : ClipboardList}
                accent="emerald"
                title={query ? "No matches found" : "No saved STDs yet"}
                description={
                  query
                    ? `Nothing matches "${search}". Try a different search term.`
                    : "Generate a Manual STD in the Test Generator tab — it will appear here automatically."
                }
              />
            )}
            <div key="manual-std" className="space-y-3">
              {filteredStds.map((std, i) => (
                <div key={std.id} className="animate-slide-up" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
                  <ManualStdCard
                    std={std}
                    onView={() => setViewingStd(std)}
                    onDownload={() => void handleDownloadStd(std)}
                    onDelete={() => void handleDeleteStd(std)}
                    isDownloading={downloadingId === std.id}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </TabContent>

      {codeViewFile && (
        <CodeViewerModal
          file={codeViewFile.file}
          isMock={codeViewFile.isMock}
          onClose={() => setCodeViewFile(null)}
        />
      )}

      {viewingStd && (
        <ManualStdViewerModal std={viewingStd} onClose={() => setViewingStd(null)} />
      )}

      {sharingFile && (
        <ShowcaseModal
          title={`${sharingFile.featureName} — ${sharingFile.fileName}`}
          publish={{ artifactType: "feature_test", featureSlug: sharingFile.featureSlug, fileName: sharingFile.fileName }}
          onClose={() => setSharingFile(null)}
        />
      )}
    </div>
  );
}
