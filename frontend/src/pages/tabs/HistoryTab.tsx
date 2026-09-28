import { useEffect, useState } from "react";
import {
  FileCode2, Globe, FileText, ChevronRight,
  Play, Eye, Trash2, RefreshCw, CalendarDays,
  Layers, Search, FlaskConical, ClipboardList,
  BrainCircuit, AlertTriangle, Wrench, ScrollText, Bot,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useTestRepository } from "../../hooks/useTestRepository";
import { useLogHistory } from "../../hooks/useLogHistory";
import { useManualStds } from "../../hooks/useManualStds";
import { FeatureGroup, LogAnalysisRecord, ManualStdRecord, TestFileInfo, TestRunStatus } from "../../types";
import { MOCK_FEATURES } from "../../data/mockData";
import { routeRunToRepository } from "../../lib/cloudRunner";
import { exportStdToPdf } from "../../lib/exportStd";
import ManualStdViewerModal from "../../components/qa-genius/ManualStdViewerModal";
import ShowcaseModal from "../../components/qa-genius/ShowcaseModal";
import CodeViewerModal from "../../components/qa-genius/CodeViewerModal";
import ManualStdCard from "../../components/qa-genius/ManualStdCard";
import { formatAbsoluteDate, formatRelativeDate } from "../../lib/formatDuration";
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
  CodeBlock,
  CopyButton,
  FOCUS_RING,
  type BadgeTone,
} from "../../components/ui/layout";

type HistoryView = "automation" | "manual-std" | "logs";

const EXECUTION_STATUS: Record<TestRunStatus, { tone: BadgeTone; label: string }> = {
  PASSED: { tone: "success", label: "Passed" },
  FAILED: { tone: "danger", label: "Failed" },
  RUNNING: { tone: "warning", label: "Running" },
};

function ExecutionStatusBadge({ status }: { status?: TestRunStatus | null }) {
  if (!status) return <Badge tone="neutral">No runs</Badge>;
  const { tone, label } = EXECUTION_STATUS[status];
  return <Badge tone={tone} dot>{label}</Badge>;
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
  const isApi = meta.inputType === "swagger";
  const panelId = `history-files-${meta.slug}`;
  const primaryDate = meta.lastRunAt ?? meta.createdAt;

  return (
    <article className="rounded-xl border border-surface-700 overflow-hidden bg-surface-800/50 transition-colors hover:border-surface-600">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={clsx(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
            isApi ? "bg-violet-500/10 border-violet-500/20" : "bg-sky-500/10 border-sky-500/20"
          )}>
            {isApi
              ? <Globe className="w-5 h-5 text-violet-400" aria-hidden />
              : <FileText className="w-5 h-5 text-sky-400" aria-hidden />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-semibold text-slate-100 mr-0.5 truncate max-w-full">{meta.featureName}</h3>
              <ExecutionStatusBadge status={meta.latestRunStatus} />
              <Badge tone={isApi ? "accent" : "info"}>{isApi ? "API" : "UI"}</Badge>
              <Badge tone="neutral">Playwright</Badge>
              {isMock && <Badge tone="warning" icon={FlaskConical}>Sample</Badge>}
            </div>

            {meta.description && (
              <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{meta.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5" title={formatAbsoluteDate(primaryDate)}>
                <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                {meta.lastRunAt ? `Last run ${formatRelativeDate(meta.lastRunAt)}` : `Created ${formatRelativeDate(meta.createdAt)}`}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Layers className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                {tests.length} file{tests.length !== 1 ? "s" : ""}
              </span>
            </div>

            {meta.prdText && (
              <p className="text-[11px] text-slate-500 mt-2.5 pl-2.5 border-l-2 border-surface-600 line-clamp-2 leading-relaxed">
                {meta.prdText}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-1 flex-shrink-0">
          <IconButton
            icon={Trash2}
            label={isMock ? "Sample data cannot be deleted" : `Delete feature ${meta.featureName}`}
            tone="danger"
            disabled={isMock}
            onClick={() => onDeleteFeature(meta.slug)}
          />
          <SecondaryButton onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls={panelId}>
            <ChevronRight
              className={clsx("w-3.5 h-3.5 transition-transform duration-200 ease-out", expanded && "rotate-90")}
              aria-hidden
            />
            {expanded ? "Hide tests" : "View tests"}
          </SecondaryButton>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-surface-700 bg-surface-900/40 p-2 animate-fade-in">
          {tests.length === 0 ? (
            <EmptyState
              icon={FileCode2}
              accent="slate"
              title="No test files"
              description="This feature has no saved test files yet."
              compact
            />
          ) : (
            <ul className="space-y-0.5">
              {tests.map((file) => (
                <li key={file.relativePath} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg transition-colors hover:bg-surface-800/80">
                  <FileCode2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-hidden />
                  <button
                    type="button"
                    onClick={() => onViewCode(file, isMock)}
                    className={clsx("flex-1 min-w-0 text-left text-xs font-mono text-slate-200 hover:text-white truncate rounded", FOCUS_RING)}
                    title={file.fileName}
                  >
                    {file.fileName}
                  </button>
                  <IconButton icon={Eye} label="View source" size="sm" onClick={() => onViewCode(file, isMock)} />
                  {!isMock && (
                    <IconButton icon={Play} label="Run in Test Repository" size="sm" tone="success" onClick={() => routeRunToRepository(file)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  playwright: "Playwright",
  "playwright-failure": "Playwright",
  coralogix: "Coralogix",
  nodejs: "Node.js",
  jest: "Jest / Vitest",
  docker: "Docker",
  custom: "Custom",
  unknown: "Unknown",
};

function formatSourceLabel(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SEVERITY_TONES: Record<string, BadgeTone> = {
  critical: "danger",
  high: "orange",
  medium: "warning",
  low: "info",
  unknown: "neutral",
};

function DetailSection({
  icon: Icon,
  title,
  iconClassName,
  copyText,
  children,
}: {
  icon: typeof AlertTriangle;
  title: string;
  iconClassName: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Icon className={clsx("w-3.5 h-3.5", iconClassName)} aria-hidden /> {title}
        </p>
        {copyText && <CopyButton text={copyText} label={`Copy ${title.toLowerCase()}`} />}
      </div>
      {children}
    </section>
  );
}

function LogAnalysisCard({
  analysis,
  onDelete,
}: {
  analysis: LogAnalysisRecord;
  onDelete: (analysis: LogAnalysisRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const severityTone = SEVERITY_TONES[analysis.severity.toLowerCase()] ?? "neutral";
  const panelId = `log-analysis-${analysis.id}`;
  const truncatedLogs = analysis.raw_logs.length > 4000;

  return (
    <article className="rounded-xl border border-surface-700 overflow-hidden bg-surface-800/50 transition-colors hover:border-surface-600">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-violet-500/10 border border-violet-500/20">
            <BrainCircuit className="w-5 h-5 text-violet-400" aria-hidden />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-100 mr-0.5 truncate max-w-full">
                {analysis.feature_name?.trim() || "Unnamed Test Automation Run"}
              </h3>
              <Badge tone={severityTone} dot>{analysis.severity}</Badge>
              <Badge tone="accent">{formatSourceLabel(analysis.source)}</Badge>
              <Badge tone="neutral" className="normal-case font-mono tracking-normal">{analysis.category}</Badge>
            </div>
            <p className="text-sm text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">{analysis.root_cause}</p>
            <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 mt-2" title={formatAbsoluteDate(analysis.created_at)}>
              <CalendarDays className="w-3.5 h-3.5" aria-hidden />
              {formatRelativeDate(analysis.created_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1 flex-shrink-0">
          <IconButton icon={Trash2} label="Delete analysis" tone="danger" onClick={() => onDelete(analysis)} />
          <SecondaryButton onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls={panelId}>
            <ChevronRight
              className={clsx("w-3.5 h-3.5 transition-transform duration-200 ease-out", expanded && "rotate-90")}
              aria-hidden
            />
            {expanded ? "Hide details" : "Details"}
          </SecondaryButton>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-surface-700 bg-surface-900/40 p-4 sm:p-5 space-y-5 animate-fade-in">
          <DetailSection icon={AlertTriangle} iconClassName="text-orange-400" title="Root Cause" copyText={analysis.root_cause}>
            <p className="text-sm text-slate-100 leading-relaxed">{analysis.root_cause}</p>
          </DetailSection>
          <DetailSection icon={ScrollText} iconClassName="text-sky-400" title="Explanation" copyText={analysis.explanation}>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{analysis.explanation}</p>
          </DetailSection>
          <DetailSection icon={Wrench} iconClassName="text-emerald-400" title="Suggested Fix">
            <CodeBlock code={analysis.suggested_fix} label="Suggested fix" maxHeight="max-h-72" />
          </DetailSection>
          <DetailSection icon={FileCode2} iconClassName="text-slate-500" title="Original Logs">
            <CodeBlock
              code={truncatedLogs ? `${analysis.raw_logs.slice(0, 4000)}\n…` : analysis.raw_logs}
              label={truncatedLogs ? "Logs (first 4,000 chars)" : "Logs"}
            />
          </DetailSection>
        </div>
      )}
    </article>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function HistoryTab() {
  const [view, setView] = useState<HistoryView>("automation");
  const { features: realFeatures, isLoading, error, refresh, deleteFeature } = useTestRepository();
  const {
    analyses,
    isLoading: logsLoading,
    error: logsError,
    refresh: refreshLogs,
    deleteAnalysis,
  } = useLogHistory();
  const { stds, isLoading: stdsLoading, error: stdsError, refresh: refreshStds, deleteStd } = useManualStds();
  const [codeViewFile, setCodeViewFile] = useState<{ file: TestFileInfo; isMock: boolean } | null>(null);
  const [viewingStd, setViewingStd] = useState<ManualStdRecord | null>(null);
  const [sharingStd, setSharingStd] = useState<ManualStdRecord | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshLogs(); }, [refreshLogs]);
  useEffect(() => { refreshStds(); }, [refreshStds]);

  useEffect(() => {
    const onChanged = () => {
      refresh();
      refreshLogs();
    };
    const onStdsChanged = () => { refreshStds(); };
    window.addEventListener("qa-genius:repository-changed", onChanged);
    window.addEventListener("qa-genius:test-runs-changed", onChanged);
    window.addEventListener("qa-genius:manual-std-changed", onStdsChanged);
    return () => {
      window.removeEventListener("qa-genius:repository-changed", onChanged);
      window.removeEventListener("qa-genius:test-runs-changed", onChanged);
      window.removeEventListener("qa-genius:manual-std-changed", onStdsChanged);
    };
  }, [refresh, refreshLogs, refreshStds]);

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

  const handleDeleteFeature = async (group: FeatureGroup) => {
    const name = group.meta.featureName;
    const count = group.tests.length;
    if (!window.confirm(`Delete feature "${name}" and all ${count} test file(s)?\nThis cannot be undone.`)) return;
    const ok = await deleteFeature(group.meta.slug);
    if (ok) toast.success(`Deleted ${name}`, { description: `${count} test file${count !== 1 ? "s" : ""} removed` });
    else toast.error(`Couldn't delete ${name}`, { description: "The feature was restored. Try again." });
  };

  const handleDeleteAnalysis = async (analysis: LogAnalysisRecord) => {
    if (!window.confirm("Delete this log analysis?")) return;
    const ok = await deleteAnalysis(analysis.id);
    if (ok) toast.success("Log analysis deleted");
    else toast.error("Couldn't delete the analysis", { description: "It was restored. Try again." });
  };

  const showMockData = !isLoading && !error && realFeatures.length === 0;
  const features: FeatureGroup[] = showMockData ? MOCK_FEATURES : realFeatures;

  const query = search.trim().toLowerCase();
  const filtered = features.filter(
    (g) =>
      !query ||
      g.meta.featureName.toLowerCase().includes(query) ||
      g.meta.description?.toLowerCase().includes(query)
  );

  const filteredLogs = analyses.filter(
    (a) =>
      !query ||
      a.feature_name?.toLowerCase().includes(query) ||
      a.source.toLowerCase().includes(query) ||
      a.root_cause.toLowerCase().includes(query) ||
      a.category.toLowerCase().includes(query)
  );

  const filteredStds = stds.filter((s) => !query || s.feature_name.toLowerCase().includes(query));

  const noMatchCopy = { title: "No matches found", description: `Nothing matches "${search}". Try a different search term.` };

  const activeLoading = view === "automation" ? isLoading : view === "manual-std" ? stdsLoading : logsLoading;
  const activeError = view === "automation" ? error : view === "manual-std" ? stdsError : logsError;
  const activeCount = view === "automation" ? realFeatures.length : view === "manual-std" ? stds.length : analyses.length;
  // Skeletons only on the first load; background refreshes keep the list visible.
  const showSkeleton = activeLoading && activeCount === 0;

  const handleRefresh = () => {
    if (view === "automation") refresh();
    else if (view === "manual-std") refreshStds();
    else refreshLogs();
  };

  const staggerStyle = (i: number) => ({ animationDelay: `${Math.min(i, 6) * 30}ms` });

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <TabToolbar className="flex-col items-stretch sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<HistoryView>
          ariaLabel="History view"
          fullWidth="mobile"
          value={view}
          onChange={setView}
          options={[
            { id: "automation", label: "Automation Runs", icon: Bot, count: realFeatures.length || undefined },
            { id: "manual-std", label: "Manual STDs", icon: ClipboardList, count: stds.length || undefined },
            { id: "logs", label: "Log Analyses", icon: BrainCircuit, count: analyses.length || undefined },
          ]}
        />

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0 sm:flex-none sm:w-56 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" aria-hidden />
            <FormInput
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                view === "automation" ? "Search features…" :
                view === "manual-std" ? "Search STDs…" :
                "Search log analyses…"
              }
              aria-label="Search history"
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
        {showSkeleton && <SkeletonCardList label="Loading history" />}

        {!activeLoading && activeError && <ErrorBanner>{activeError}</ErrorBanner>}

        {view === "automation" && !showSkeleton && (
          <>
            {showMockData && (
              <DemoBanner>
                <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                <span>
                  <strong className="font-semibold">Demo Mode</strong> — sample features to showcase the UI.
                  Generate your first real test in the <strong className="font-semibold">Test Generator</strong> tab to replace them.
                </span>
              </DemoBanner>
            )}

            {filtered.length === 0 && !activeLoading && (
              <EmptyState
                icon={query ? Search : FileCode2}
                accent="slate"
                title={query ? noMatchCopy.title : "No Automation runs yet"}
                description={query ? noMatchCopy.description : "Generate and run Playwright tests in the Test Generator tab to see them here."}
              />
            )}

            <div key="automation" className="space-y-3">
              {filtered.map((group, i) => (
                <div key={group.meta.slug} className="animate-slide-up" style={staggerStyle(i)}>
                  <FeatureHistoryCard
                    group={group}
                    isMock={showMockData}
                    onViewCode={(file, isMock) => setCodeViewFile({ file, isMock })}
                    onDeleteFeature={() => void handleDeleteFeature(group)}
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
                accent="slate"
                title={query ? noMatchCopy.title : "No Manual STDs yet"}
                description={query ? noMatchCopy.description : "Generate a Manual STD in the Test Generator tab — it will appear here automatically."}
              />
            )}

            <div key="manual-std" className="space-y-3">
              {filteredStds.map((std, i) => (
                <div key={std.id} className="animate-slide-up" style={staggerStyle(i)}>
                  <ManualStdCard
                    std={std}
                    onView={() => setViewingStd(std)}
                    onDownload={() => void handleDownloadStd(std)}
                    onDelete={() => void handleDeleteStd(std)}
                    onShare={() => setSharingStd(std)}
                    isDownloading={downloadingId === std.id}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {view === "logs" && !showSkeleton && (
          <>
            {filteredLogs.length === 0 && !logsError && !activeLoading && (
              <EmptyState
                icon={query ? Search : BrainCircuit}
                accent={query ? "slate" : "violet"}
                title={query ? noMatchCopy.title : "No log analyses saved yet"}
                description={query ? noMatchCopy.description : "Run an analysis in the Log Analyzer tab — results are saved here automatically for future reference."}
                hint={query ? undefined : "Supports Playwright, Coralogix, Node.js, Jest, and Docker logs."}
              />
            )}

            <div key="logs" className="space-y-3">
              {filteredLogs.map((analysis, i) => (
                <div key={analysis.id} className="animate-slide-up" style={staggerStyle(i)}>
                  <LogAnalysisCard analysis={analysis} onDelete={(a) => void handleDeleteAnalysis(a)} />
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

      {sharingStd && (
        <ShowcaseModal
          title={sharingStd.feature_name}
          publish={{ artifactType: "manual_std", sourceId: sharingStd.id }}
          onClose={() => setSharingStd(null)}
        />
      )}
    </div>
  );
}
