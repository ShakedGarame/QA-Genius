import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { BrainCircuit, Loader2, AlertTriangle, ArrowRight, FileCode2, CheckCircle2, XCircle, Clock } from "lucide-react";
import clsx from "clsx";
import { ShowcaseFeatureTestSnapshot, ShowcasePublicView } from "../types";
import ManualStdTable from "../components/qa-genius/ManualStdTable";
import { CopyButton } from "../components/ui/FullscreenModal";
import { formatDuration } from "../lib/formatDuration";

function FeatureTestShowcase({ snapshot }: { snapshot: ShowcaseFeatureTestSnapshot }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border bg-sky-500/15 text-sky-400 border-sky-500/30">
          {snapshot.inputType === "swagger" ? "API" : "UI"}
        </span>
        {snapshot.latestRun ? (
          <span
            className={clsx(
              "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border",
              snapshot.latestRun.status === "PASSED"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/15 text-red-400 border-red-500/30"
            )}
          >
            {snapshot.latestRun.status === "PASSED" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {snapshot.latestRun.status} · {formatDuration(snapshot.latestRun.durationMs)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border bg-slate-600/20 text-slate-400 border-slate-500/30">
            <Clock className="w-3 h-3" /> Not yet executed
          </span>
        )}
      </div>

      {snapshot.prdText && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1.5">Source PRD</p>
          <p className="text-sm text-slate-300 bg-surface-800/50 border border-surface-600 rounded-lg px-3 py-2.5 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {snapshot.prdText}
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
          <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <FileCode2 className="w-3.5 h-3.5" /> {snapshot.fileName}
          </p>
          <CopyButton text={snapshot.code} />
        </div>
        <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-surface-600 bg-surface-800/50 p-4">
          <pre className="text-xs font-mono text-slate-300 leading-5 whitespace-pre-wrap">{snapshot.code}</pre>
        </div>
      </div>
    </div>
  );
}

/** Public, no-login "case study" page for one published showcase link. Renders a
 * read-only snapshot — never talks to any authenticated endpoint. */
export default function ShowcasePage() {
  const { slug } = useParams<{ slug: string }>();
  const [view, setView] = useState<ShowcasePublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = "QA-Genius — Showcase";
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch(`/api/showcase/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "This showcase link doesn't exist or was revoked.");
        if (!cancelled) {
          setView(json.showcase as ShowcasePublicView);
          document.title = `${json.showcase.title} — QA-Genius Showcase`;
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load showcase");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <header className="border-b border-surface-700 bg-surface-800/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-sky-400" />
            <span className="text-sm font-bold text-white">QA-Genius</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-sky-500/15 text-sky-400 border border-sky-500/30">
              Showcase
            </span>
          </div>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-surface-700/80 hover:bg-surface-700 px-3 py-2 rounded-lg transition-colors"
          >
            Try it yourself <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col min-h-0">
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading showcase…</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-slate-300">{error}</p>
            <Link to="/" className="text-xs text-sky-400 hover:text-sky-300 mt-2">
              Go to QA-Genius →
            </Link>
          </div>
        )}

        {view && !isLoading && !error && "testCases" in view.snapshot && (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{view.title}</h1>
              <p className="text-xs text-slate-500 mt-1">
                AI-generated test documentation, published as a public example.
              </p>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <ManualStdTable
                testCases={view.snapshot.testCases}
                coverage={view.snapshot.coverage}
                featureName={view.snapshot.featureName}
                domain={view.snapshot.domain}
                model={view.snapshot.model}
                isMock={view.snapshot.isMock}
              />
            </div>
          </div>
        )}

        {view && !isLoading && !error && "code" in view.snapshot && (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{view.title}</h1>
              <p className="text-xs text-slate-500 mt-1">
                AI-generated Playwright test, published as a public example.
              </p>
            </div>
            <FeatureTestShowcase snapshot={view.snapshot} />
          </div>
        )}
      </main>

      <footer className="border-t border-surface-700 py-4 text-center text-[11px] text-slate-600">
        Generated by{" "}
        <Link to="/" className="text-slate-400 hover:text-slate-200">
          QA-Genius
        </Link>{" "}
        — AI-powered test generation &amp; observability.
      </footer>
    </div>
  );
}
