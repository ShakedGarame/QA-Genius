import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  BrainCircuit,
  Bug,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileCode2,
  Github,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { RawLogAnalysisResponse } from "../../types";
import { buildOpenAIKeyHeaders } from "../../lib/apiKeys";
import { buildGitHubTokenHeaders } from "../../lib/githubToken";
import { readPendingAnalyzerPayload } from "../../lib/cloudRunner";
import type { AnalyzerRoutePayload } from "../../lib/cloudRunner";
import { useAuth } from "../../hooks/useAuth";
import {
  EmptyState,
  SectionLabel,
  FormInput,
  FormTextarea,
  SelectInput,
  ErrorBanner,
  PrimaryButton,
  SecondaryButton,
  IconButton,
  CopyButton,
  Badge,
  Skeleton,
  FOCUS_RING,
  type BadgeTone,
} from "../../components/ui/layout";
import SelfHealModal from "../../components/qa-genius/SelfHealModal";

// Monaco is the single heaviest dependency in the app — only lazy-load it once
// an analysis with a suggested fix actually exists.
const TestEditor = lazy(() => import("../../components/qa-genius/TestEditor"));

const LOG_SOURCES = [
  { value: "playwright", label: "Playwright Test Failure", icon: "🎭", placeholder: `Error: Timed out 5000ms waiting for expect(locator).toBeVisible()

Call log:
  - expect.toBeVisible with timeout 5000ms
  - waiting for getByRole('button', { name: /submit/i })

    at LoginPage.submit (pages/login.page.ts:47:12)
    at test (tests/auth.spec.ts:32:20)` },
  { value: "coralogix", label: "Coralogix Production Logs", icon: "📡", placeholder: `[2026-06-22T11:24:01Z] [ERROR] checkout-service: UnhandledPromiseRejection: Cannot read property 'price' of undefined
  at validateCartItems (cart.service.ts:87:14)
  at async CheckoutController.create (checkout.controller.ts:43:5)
[2026-06-22T11:24:01Z] [ERROR] api-gateway: Upstream checkout-service returned 500
[2026-06-22T11:24:02Z] [WARN] frontend: API call to /api/checkout failed with 500 — rendering error state` },
  { value: "nodejs", label: "Node.js Backend Error", icon: "⚙️", placeholder: `UnhandledPromiseRejectionWarning: Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1144:16)
UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function...
(node:3112) PromiseRejectionHandledWarning: Promise rejection was handled asynchronously` },
  { value: "jest", label: "Jest / Vitest Output", icon: "🧪", placeholder: `FAIL tests/auth.test.ts
  ● AuthService › login › should return user on valid credentials

    expect(received).toBe(expected)

    Expected: true
    Received: false

      28 |   it('should return user on valid credentials', async () => {
      29 |     const result = await authService.login({ email: 'test@test.com', password: 'wrong' });
    > 30 |     expect(result.success).toBe(true);
         |                            ^` },
  { value: "docker", label: "Docker / Container Logs", icon: "🐳", placeholder: `standard_init_linux.go:228: exec user process caused: exec format error
Error response from daemon: OCI runtime create failed: container_linux.go:380: starting container process caused: process_linux.go:545: container init caused: rootfs_linux.go:76: mounting "/var/lib/docker/..."` },
  { value: "custom", label: "Custom / Other", icon: "📋", placeholder: "Paste your raw logs, stack traces, or error output here..." },
] as const;

type LogSource = typeof LOG_SOURCES[number]["value"];

const SEVERITY_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  critical: { label: "Critical", tone: "danger" },
  high: { label: "High", tone: "orange" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "info" },
  unknown: { label: "Unknown", tone: "neutral" },
};

/** Result card with a colored eyebrow title and an optional copy action. */
function ResultCard({
  icon: Icon,
  title,
  tone,
  copyText,
  className,
  children,
}: {
  icon: typeof Info;
  title: string;
  tone: "orange" | "sky" | "emerald";
  copyText?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    orange: "text-orange-300",
    sky: "text-sky-300",
    emerald: "text-emerald-300",
  }[tone];
  return (
    <section className={clsx("rounded-xl bg-surface-800/50 border border-surface-700 p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className={clsx("flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider", toneClass)}>
          <Icon className="w-4 h-4" aria-hidden />
          {title}
        </h3>
        {copyText && <CopyButton text={copyText} label={`Copy ${title.toLowerCase()}`} />}
      </div>
      {children}
    </section>
  );
}

function AnalysisSkeleton({ statusMessage }: { statusMessage: string }) {
  return (
    <div className="space-y-4 animate-fade-in" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-violet-400 animate-spin" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">Analyzing logs…</p>
          <p className="text-xs text-slate-500">{statusMessage || "Sending to AI engine"}</p>
        </div>
      </div>
      {[
        { lines: [90, 60], h: "h-4" },
        { lines: [100, 95, 70], h: "h-3" },
      ].map((card, i) => (
        <div key={i} className="rounded-xl bg-surface-800/50 border border-surface-700 p-4 sm:p-5 space-y-3">
          <Skeleton className="h-3 w-32" />
          {card.lines.map((w, j) => (
            <Skeleton key={j} className={card.h} style={{ width: `${w}%` }} />
          ))}
        </div>
      ))}
      <div className="rounded-xl bg-surface-800/50 border border-surface-700 p-4 sm:p-5 space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  );
}

const HEAL_ELIGIBLE_SOURCES: LogSource[] = ["playwright"];
const HEAL_ELIGIBLE_CATEGORIES = ["test-failure"];

export default function LogAnalyzerTab() {
  const { user } = useAuth();
  const [source, setSource] = useState<LogSource>("playwright");
  const [rawLogs, setRawLogs] = useState("");
  const [testCode, setTestCode] = useState("");
  const [featureSlug, setFeatureSlug] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  const [runName, setRunName] = useState("");
  const [showTestCodeField, setShowTestCodeField] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<RawLogAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfHealOpen, setSelfHealOpen] = useState(false);
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [resultTimestamp, setResultTimestamp] = useState<number | null>(null);
  const testCodeRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // ── Ticket dispatch ──────────────────────────────────────────────────────────
  const [githubStatus, setGithubStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [githubTicketUrl, setGithubTicketUrl] = useState<string | null>(null);
  const [githubErrorMsg, setGithubErrorMsg] = useState<string | null>(null);
  const [jiraStatus, setJiraStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [jiraTicketUrl, setJiraTicketUrl] = useState<string | null>(null);
  const [jiraErrorMsg, setJiraErrorMsg] = useState<string | null>(null);
  const [jiraProjectKey, setJiraProjectKey] = useState(
    () => localStorage.getItem("qa-genius:jira-project-key") ?? ""
  );

  const activeSource = LOG_SOURCES.find((s) => s.value === source)!;
  const isPlaywright = HEAL_ELIGIBLE_SOURCES.includes(source);

  const handleSelfHealClick = useCallback(() => {
    if (testCode.trim()) {
      setSelfHealOpen(true);
    } else {
      setShowTestCodeField(true);
      // Scroll + focus the textarea after it renders
      setTimeout(() => {
        testCodeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        testCodeRef.current?.focus();
      }, 80);
    }
  }, [testCode]);
  const isHealEligible =
    result !== null &&
    (isPlaywright || HEAL_ELIGIBLE_CATEGORIES.includes(result.category ?? ""));

  const handleAnalyze = useCallback(async (logsOverride?: string, sourceOverride?: LogSource, featureNameOverride?: string) => {
    const logsToAnalyze = logsOverride ?? rawLogs;
    const sourceToUse = sourceOverride ?? source;
    const featureNameToUse = featureNameOverride ?? runName;
    if (!logsToAnalyze.trim()) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    // Guards against a hung backend/LLM call leaving the UI stuck on
    // "Sending to AI engine…" forever — abort and surface an error instead.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch("/api/analyze-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildOpenAIKeyHeaders() },
        credentials: "include",
        body: JSON.stringify({
          rawLogs: logsToAnalyze,
          source: sourceToUse,
          featureName: featureNameToUse.trim() || undefined,
        }),
        signal: controller.signal,
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
            const data = JSON.parse(dataLine) as Record<string, unknown>;
            if (eventType === "status") {
              setStatusMessage(String(data.message ?? ""));
            } else if (eventType === "result") {
              setResult(data as unknown as RawLogAnalysisResponse);
              window.dispatchEvent(new CustomEvent("qa-genius:repository-changed"));
            } else if (eventType === "error") {
              setError(String(data.message ?? "Analysis failed"));
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Analysis timed out after 2 minutes — the AI service may be slow or unresponsive. Please try again.");
      } else {
        setError(e instanceof Error ? e.message : "Analysis failed");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
      setStatusMessage("");
    }
  }, [rawLogs, source, runName]);

  const applyPopulate = useCallback(
    (detail: AnalyzerRoutePayload) => {
      if (!detail.logs?.trim()) return;
      const incomingSource = (detail.source as LogSource) ?? "playwright";
      setRawLogs(detail.logs);
      setSource(incomingSource);
      setResult(null);
      setError(null);

      // Carry self-heal context if provided
      if (detail.testCode) {
        setTestCode(detail.testCode);
        setShowTestCodeField(true);
      }
      if (detail.featureSlug) setFeatureSlug(detail.featureSlug);
      if (detail.fileName) setFileName(detail.fileName);
      setRunName(detail.featureName?.trim() || "");

      if (detail.autoTrigger) {
        setTimeout(() => handleAnalyze(detail.logs, incomingSource, detail.featureName), 100);
      }
    },
    [handleAnalyze]
  );

  useEffect(() => {
    const pending = readPendingAnalyzerPayload();
    if (pending?.logs) applyPopulate(pending);
  }, [applyPopulate]);

  useEffect(() => {
    if (result) {
      setInputCollapsed(true);
      setResultTimestamp(Date.now());
      // Wait a frame so the input card has collapsed before measuring —
      // otherwise the scroll target is computed against the taller layout.
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [result]);

  useEffect(() => {
    const onPopulate = (event: Event) => {
      const detail = (event as CustomEvent<AnalyzerRoutePayload>).detail;
      if (!detail?.logs) return;
      applyPopulate(detail);
    };
    window.addEventListener("qa-genius:populate-log-analyzer", onPopulate);
    return () => window.removeEventListener("qa-genius:populate-log-analyzer", onPopulate);
  }, [applyPopulate]);

  const handleClear = () => {
    setRawLogs("");
    setTestCode("");
    setFeatureSlug(undefined);
    setFileName(undefined);
    setRunName("");
    setResult(null);
    setError(null);
    setGithubStatus("idle");
    setGithubTicketUrl(null);
    setGithubErrorMsg(null);
    setJiraStatus("idle");
    setJiraTicketUrl(null);
    setJiraErrorMsg(null);
    setInputCollapsed(false);
    setResultTimestamp(null);
  };

  const handleFileGitHubIssue = async () => {
    if (!result) return;
    setGithubStatus("loading");
    setGithubErrorMsg(null);

    const issueBody = [
      `## Root Cause\n${result.rootCause}`,
      `## Technical Breakdown\n${result.explanation}`,
      `## Suggested Fix\n${result.suggestedFix}`,
      `\n---\n*Filed automatically by [QA Genius](https://qa-genius-app.vercel.app)*`,
    ].join("\n\n");

    try {
      const res = await fetch("/api/issues/github/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildGitHubTokenHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({
          title: `🐛 QA Failure: ${result.rootCause.slice(0, 100)}`,
          body: issueBody,
          labels: ["bug", "qa-genius"],
        }),
      });
      const data = await res.json() as { issueUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create issue");
      setGithubStatus("success");
      setGithubTicketUrl(data.issueUrl ?? null);
      toast.success("GitHub issue created", data.issueUrl
        ? { action: { label: "Open", onClick: () => window.open(data.issueUrl, "_blank", "noopener,noreferrer") } }
        : undefined);
    } catch (err) {
      setGithubStatus("error");
      setGithubErrorMsg(err instanceof Error ? err.message : "Failed to create GitHub issue");
    }
  };

  const handleFileJiraTicket = async () => {
    if (!result) return;
    if (!user?.hasJira) {
      setJiraStatus("error");
      setJiraErrorMsg("Configure Jira in Settings to auto-create issues.");
      return;
    }
    setJiraStatus("loading");
    setJiraErrorMsg(null);

    const description = [
      `Root Cause:\n${result.rootCause}`,
      `Technical Breakdown:\n${result.explanation}`,
      `Suggested Fix:\n${result.suggestedFix}`,
    ].join("\n\n");

    try {
      const res = await fetch("/api/issues/jira/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `QA Failure: ${result.rootCause.slice(0, 200)}`,
          description,
          projectKey: jiraProjectKey.trim().toUpperCase(),
        }),
      });
      const data = await res.json() as { issueUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create Jira ticket");
      setJiraStatus("success");
      setJiraTicketUrl(data.issueUrl ?? null);
      toast.success("Jira issue created", data.issueUrl
        ? { action: { label: "Open", onClick: () => window.open(data.issueUrl, "_blank", "noopener,noreferrer") } }
        : undefined);
    } catch (err) {
      setJiraStatus("error");
      setJiraErrorMsg(err instanceof Error ? err.message : "Failed to create Jira ticket");
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Top: input card (collapses to a sticky summary once analysis completes) ── */}
      <div className={clsx("flex-shrink-0 p-4 sm:p-6 pb-4", inputCollapsed && "sticky top-0 z-10 bg-surface-900")}>
        {inputCollapsed ? (
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap bg-surface-800/80 backdrop-blur-sm border border-surface-700 rounded-xl pl-4 pr-2 py-2 text-xs animate-fade-in">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-500">Test</span>
              <span className="font-medium text-slate-200 truncate max-w-[200px]">{runName.trim() || "Untitled"}</span>
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-500">Source</span>
              <span className="text-slate-300 truncate">{activeSource.label}</span>
            </span>
            <SecondaryButton onClick={() => setInputCollapsed(false)} className="ml-auto">
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              Edit logs
            </SecondaryButton>
          </div>
        ) : (
        <div className="bg-surface-800/50 border border-surface-700 rounded-xl p-4 sm:p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Instant Log Analyzer</h2>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              Paste logs — AI explains the root cause in plain language.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            {/* Test / feature name (optional) — used as the primary title in History */}
            <div className="flex-1 min-w-0">
              <SectionLabel htmlFor="log-run-name">Test / Feature Name (optional)</SectionLabel>
              <FormInput
                id="log-run-name"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="e.g. Login Flow, Checkout API"
                className="text-sm w-full"
              />
            </div>

            {/* Source dropdown */}
            <div className="w-full lg:w-72 flex-shrink-0">
              <SectionLabel htmlFor="log-source">Log Source</SectionLabel>
              <SelectInput
                  id="log-source"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value as LogSource);
                    setRawLogs("");
                    setResult(null);
                  }}
                >
                  {LOG_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.icon} {s.label}
                    </option>
                  ))}
              </SelectInput>
            </div>
          </div>

          {/* Log text area */}
          <div>
            <SectionLabel htmlFor="log-raw">Raw Logs / Error Output</SectionLabel>
            <FormTextarea
              id="log-raw"
              value={rawLogs}
              onChange={(e) => setRawLogs(e.target.value)}
              placeholder={activeSource.placeholder}
              className="min-h-[120px]"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 text-right tabular-nums">
              {rawLogs.length.toLocaleString()} characters
            </p>
          </div>

          {/* Playwright Test Code (collapsible, self-heal context) */}
          {isPlaywright && (
            <div>
              <button
                type="button"
                onClick={() => setShowTestCodeField((v) => !v)}
                aria-expanded={showTestCodeField}
                className={clsx("flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-2 rounded", FOCUS_RING)}
              >
                <ChevronRight
                  className={clsx("w-3.5 h-3.5 transition-transform duration-200 ease-out", showTestCodeField && "rotate-90")}
                  aria-hidden
                />
                <FileCode2 className="w-3.5 h-3.5" aria-hidden />
                <span className="font-medium">
                  Test Code{" "}
                  <span className="text-slate-500 font-normal">(optional — enables Self-Heal)</span>
                </span>
                {testCode && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="Test code provided" />
                )}
              </button>

              {showTestCodeField && (
                <FormTextarea
                  ref={testCodeRef}
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  placeholder={"// Paste the failing .spec.ts file here\nimport { test, expect } from '@playwright/test';\n\ntest('login', async ({ page }) => {\n  await page.goto('/');\n  // ...\n});"}
                  className="min-h-[140px] font-mono text-[11px]"
                />
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <PrimaryButton
              onClick={() => void handleAnalyze()}
              disabled={!rawLogs.trim() || isAnalyzing}
              loading={isAnalyzing}
              icon={BrainCircuit}
              accent="violet"
              className="flex-1 sm:flex-none"
            >
              {isAnalyzing ? (statusMessage || "Analyzing…") : "Analyze Logs"}
            </PrimaryButton>
            {(rawLogs || result) && (
              <IconButton
                icon={RotateCcw}
                label="Clear logs and result"
                onClick={handleClear}
                className="w-10 h-10 bg-surface-700/80 border border-surface-600"
              />
            )}
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}
        </div>
        )}
      </div>

      {/* ── Bottom: full-width results canvas ── */}
      <div className="qa-main-pane overflow-visible px-4 sm:px-6 pt-2 pb-24 flex flex-col">
        {!result && !isAnalyzing && (
          <EmptyState
            icon={BrainCircuit}
            accent="violet"
            title="No analysis yet"
            description='Paste your logs above and click "Analyze Logs" to get a plain-language root cause breakdown.'
            hint="Supports: Playwright · Coralogix · Node.js · Jest · Docker"
          />
        )}

        {isAnalyzing && <AnalysisSkeleton statusMessage={statusMessage} />}

        {result && !isAnalyzing && (
          <div ref={resultRef} className="space-y-4 animate-slide-up scroll-mt-32">
            {/* Header row: icon + title + badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-violet-400" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">AI Analysis Complete</p>
                  <p className="text-xs text-slate-500">
                    {activeSource.label}
                    {runName.trim() && <span> · {runName.trim()}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {resultTimestamp && (
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(resultTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {result.category && result.category !== "unknown" && (
                  <Badge tone="neutral" className="normal-case font-mono tracking-normal">{result.category}</Badge>
                )}
                {result.severity && SEVERITY_CONFIG[result.severity] && (
                  <Badge tone={SEVERITY_CONFIG[result.severity].tone} dot>
                    {SEVERITY_CONFIG[result.severity].label}
                  </Badge>
                )}
                {result.isMock && <Badge tone="warning">Mock</Badge>}
              </div>
            </div>

            <ResultCard icon={ShieldAlert} title="Root Cause" tone="orange" copyText={result.rootCause} className="border-orange-500/15">
              <p className="text-[15px] font-medium text-slate-100 leading-relaxed">
                {result.rootCause}
              </p>
            </ResultCard>

            <ResultCard icon={Info} title="Technical Explanation" tone="sky" copyText={result.explanation}>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {result.explanation}
              </p>
            </ResultCard>

            {/* Suggested fix — syntax-highlighted, read-only */}
            <ResultCard icon={Wrench} title="Recommended Code Fix" tone="emerald" className="border-emerald-500/15">
              <div className="h-72 rounded-lg overflow-hidden border border-surface-700">
                <Suspense
                  fallback={
                    <Skeleton className="w-full h-full rounded-none" />
                  }
                >
                  <TestEditor code={result.suggestedFix} readOnly fileName="suggested-fix.ts" />
                </Suspense>
              </div>
            </ResultCard>

            {/* Primary Action Bar — sits statically below the code fix in normal document
                flow so it never overlays content or blocks page scroll. */}
            <div className="pt-2 pb-1">
            <div className="rounded-xl border bg-surface-800/50 border-surface-700 p-4 sm:p-5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Next steps
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-end gap-3">
                {/* Jira */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={jiraProjectKey}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                        setJiraProjectKey(v);
                        localStorage.setItem("qa-genius:jira-project-key", v);
                      }}
                      placeholder="KEY"
                      maxLength={10}
                      title="Jira project key (e.g. QA, BUG)"
                      aria-label="Jira project key"
                      className="w-[68px] h-8 bg-surface-900 border border-surface-600 text-slate-200 text-xs rounded-lg px-2 font-mono placeholder-slate-600 uppercase transition-[border-color,box-shadow] focus:outline-none focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/25"
                    />
                    {jiraStatus === "success" && jiraTicketUrl ? (
                      <a
                        href={jiraTicketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={clsx("pressable flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20", FOCUS_RING)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Jira Ticket Created
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <button
                        onClick={() => void handleFileJiraTicket()}
                        disabled={jiraStatus === "loading"}
                        className={clsx("pressable flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-60 disabled:cursor-not-allowed text-white", FOCUS_RING)}
                      >
                        {jiraStatus === "loading" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Bug className="w-3.5 h-3.5" />
                        )}
                        {jiraStatus === "loading" ? "Filing Ticket…" : "Create Jira Issue"}
                      </button>
                    )}
                  </div>
                  {(jiraStatus === "error" || jiraErrorMsg) && (
                    <p className="text-[11px] text-red-400 max-w-[260px] leading-tight">
                      {jiraErrorMsg}
                      {!user?.hasJira && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent("qa-genius:navigate-tab", { detail: { tab: "settings" } }))}
                            className="underline hover:text-red-300 transition-colors"
                          >
                            Open Settings
                          </button>
                        </>
                      )}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Leave blank to use the project key from your Jira Domain URL
                  </p>
                </div>

                {/* GitHub */}
                <div className="flex flex-col gap-1.5">
                  {githubStatus === "success" && githubTicketUrl ? (
                    <a
                      href={githubTicketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx("pressable flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20", FOCUS_RING)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      GitHub Issue Created
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <button
                      onClick={() => void handleFileGitHubIssue()}
                      disabled={githubStatus === "loading"}
                      className={clsx("pressable flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium bg-[#24292e] hover:bg-[#32383e] border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed text-white", FOCUS_RING)}
                    >
                      {githubStatus === "loading" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Github className="w-3.5 h-3.5" />
                      )}
                      {githubStatus === "loading" ? "Filing Issue…" : "Create GitHub Issue"}
                    </button>
                  )}
                  {githubStatus === "error" && githubErrorMsg && (
                    <p className="text-[11px] text-red-400 max-w-[220px] leading-tight">{githubErrorMsg}</p>
                  )}
                </div>

                {/* Self-Heal — shown for Playwright / test-failure results */}
                {isHealEligible && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={handleSelfHealClick}
                      className={clsx("pressable flex items-center justify-center gap-2 h-8 px-3 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-black/30", FOCUS_RING)}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Apply Self-Heal Fix
                    </button>
                    {!testCode.trim() && (
                      <p className="text-[11px] text-slate-500 max-w-[200px] leading-tight">
                        Paste the failing test code above first
                      </p>
                    )}
                  </div>
                )}

                {/* Re-Analyze */}
                <button
                  onClick={() => void handleAnalyze()}
                  disabled={isAnalyzing}
                  className={clsx("pressable flex items-center justify-center gap-2 h-8 px-3 rounded-lg text-xs font-medium bg-surface-700/80 hover:bg-surface-600 text-slate-200 border border-surface-600 disabled:opacity-50 disabled:cursor-not-allowed", FOCUS_RING)}
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Re-Analyze
                </button>
              </div>
            </div>
            </div>

          </div>
        )}
      </div>

      {/* Self-Heal Modal */}
      <SelfHealModal
        open={selfHealOpen}
        onClose={() => setSelfHealOpen(false)}
        testCode={testCode}
        errorOutput={rawLogs}
        rootCause={result?.rootCause}
        suggestedFix={result?.suggestedFix}
        featureSlug={featureSlug}
        fileName={fileName}
        onSaved={() => {
          setSelfHealOpen(false);
        }}
      />
    </div>
  );
}
