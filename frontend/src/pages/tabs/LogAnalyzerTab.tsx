import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  BrainCircuit,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode2,
  Github,
  Info,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import clsx from "clsx";
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
  ErrorBanner,
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

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "CRITICAL", color: "text-red-300", bg: "bg-red-500/15 border-red-500/30" },
  high: { label: "HIGH", color: "text-orange-300", bg: "bg-orange-500/15 border-orange-500/30" },
  medium: { label: "MEDIUM", color: "text-yellow-300", bg: "bg-yellow-500/15 border-yellow-500/30" },
  low: { label: "LOW", color: "text-blue-300", bg: "bg-blue-500/15 border-blue-500/30" },
  unknown: { label: "UNKNOWN", color: "text-slate-400", bg: "bg-slate-500/15 border-slate-500/30" },
};

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
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          <div className="flex items-center gap-2 flex-wrap bg-surface-800/60 border border-surface-700 rounded-xl px-4 py-2.5 text-xs text-slate-300">
            <span className="text-slate-500">Test:</span>
            <span className="font-semibold text-slate-200 truncate max-w-[200px]">{runName.trim() || "Untitled"}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">Source:</span>
            <span>{activeSource.icon} {activeSource.label}</span>
            <button
              onClick={() => setInputCollapsed(false)}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors flex-shrink-0"
            >
              ✏️ Edit Logs
            </button>
          </div>
        ) : (
        <div className="bg-surface-800/60 border border-surface-700 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Instant Log Analyzer</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Paste logs — AI explains the root cause in plain language
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            {/* Test / feature name (optional) — used as the primary title in History */}
            <div className="flex-1 min-w-0">
              <SectionLabel>Test / Feature Name (optional)</SectionLabel>
              <FormInput
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="e.g. Login Flow, Checkout API"
                className="text-sm w-full"
              />
            </div>

            {/* Source dropdown */}
            <div className="w-full lg:w-72 flex-shrink-0">
              <SectionLabel>Log Source</SectionLabel>
              <div className="relative">
                <select
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value as LogSource);
                    setRawLogs("");
                    setResult(null);
                  }}
                  className="w-full appearance-none bg-surface-900 border border-surface-600 text-slate-200 text-sm rounded-lg px-4 py-2.5 pr-8 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 cursor-pointer"
                >
                  {LOG_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.icon} {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Log text area */}
          <div>
            <SectionLabel>Raw Logs / Error Output</SectionLabel>
            <FormTextarea
              value={rawLogs}
              onChange={(e) => setRawLogs(e.target.value)}
              placeholder={activeSource.placeholder}
              className="min-h-[120px]"
            />
            <p className="text-[10px] text-slate-600 mt-1 text-right">
              {rawLogs.length.toLocaleString()} characters
            </p>
          </div>

          {/* Playwright Test Code (collapsible, self-heal context) */}
          {isPlaywright && (
            <div>
              <button
                onClick={() => setShowTestCodeField((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-1.5 group"
              >
                {showTestCodeField
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
                <FileCode2 className="w-3.5 h-3.5" />
                <span className="font-medium">
                  Test Code{" "}
                  <span className="text-slate-600 font-normal">(optional — enables Self-Heal)</span>
                </span>
                {testCode && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
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
            <button
              onClick={() => void handleAnalyze()}
              disabled={!rawLogs.trim() || isAnalyzing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium shadow-lg transition-all"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BrainCircuit className="w-4 h-4" />
              )}
              {isAnalyzing ? (statusMessage || "Analyzing…") : "Analyze Logs"}
            </button>
            {(rawLogs || result) && (
              <button
                onClick={handleClear}
                className="px-3 py-2.5 text-slate-400 hover:text-slate-200 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors flex-shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}
        </div>
        )}
      </div>

      {/* ── Bottom: full-width results canvas ── */}
      <div className="qa-main-pane overflow-visible p-4 sm:p-6 pt-0 pb-24 flex flex-col">
        {!result && !isAnalyzing && (
          <EmptyState
            icon={BrainCircuit}
            accent="violet"
            title="No analysis yet"
            description='Paste your logs on the left and click "Analyze Logs" to get a plain-language root cause breakdown.'
            hint="Supports: Playwright · Coralogix · Node.js · Jest · Docker"
          />
        )}

        {isAnalyzing && (
          <EmptyState
            icon={Zap}
            accent="violet"
            title="Analyzing logs…"
            description={statusMessage || "Sending to AI engine"}
          />
        )}

        {result && !isAnalyzing && (
          <div ref={resultRef} className="p-4 sm:p-6 space-y-5 animate-fade-in">
            {/* Header row: icon + title + badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">AI Analysis Complete</p>
                  <p className="text-xs text-slate-500">
                    {activeSource.icon} {activeSource.label}
                    {runName.trim() && <span className="text-slate-600"> · {runName.trim()}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {resultTimestamp && (
                  <span className="text-[10px] text-slate-600">
                    {new Date(resultTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {result.severity && SEVERITY_CONFIG[result.severity] && (
                  <span
                    className={clsx(
                      "text-[10px] font-bold px-2 py-1 rounded border",
                      SEVERITY_CONFIG[result.severity].bg,
                      SEVERITY_CONFIG[result.severity].color
                    )}
                  >
                    {SEVERITY_CONFIG[result.severity].label}
                  </span>
                )}
                {result.isMock && (
                  <span className="text-[10px] text-slate-500 bg-surface-700 px-2 py-0.5 rounded border border-surface-500">
                    MOCK
                  </span>
                )}
              </div>
            </div>

            {/* Root cause */}
            <div className="rounded-xl bg-surface-800/50 border border-surface-600 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-orange-400" />
                <p className="text-xs font-bold text-orange-300 uppercase tracking-wider">Root Cause</p>
              </div>
              <p className="text-sm font-semibold text-slate-100 leading-relaxed">
                {result.rootCause}
              </p>
            </div>

            {/* Technical explanation */}
            <div className="rounded-xl bg-surface-800/50 border border-surface-600 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-sky-400" />
                <p className="text-xs font-bold text-sky-300 uppercase tracking-wider">
                  Technical Explanation
                </p>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {result.explanation}
              </p>
            </div>

            {/* Suggested fix — syntax-highlighted, read-only */}
            <div className="rounded-xl bg-surface-800 border border-emerald-500/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Recommended Code Fix
                  </p>
                </div>
              </div>
              <div className="h-72 rounded-lg overflow-hidden">
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center bg-surface-900 text-slate-500 text-sm">
                      Loading editor…
                    </div>
                  }
                >
                  <TestEditor code={result.suggestedFix} readOnly fileName="suggested-fix.ts" />
                </Suspense>
              </div>
            </div>

            {/* Primary Action Bar — sits statically below the code fix in normal document
                flow so it never overlays content or blocks page scroll. */}
            <div className="pt-3 pb-1">
            <div className="rounded-xl border bg-surface-800 border-surface-600 p-4 sm:p-5 shadow-2xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                Actions
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
                      className="w-[68px] bg-surface-900 border border-surface-600 text-slate-200 text-xs rounded-lg px-2 py-2 font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#0052CC] focus:border-[#0052CC] uppercase"
                    />
                    {jiraStatus === "success" && jiraTicketUrl ? (
                      <a
                        href={jiraTicketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Jira Ticket Created
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <button
                        onClick={() => void handleFileJiraTicket()}
                        disabled={jiraStatus === "loading"}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
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
                    <p className="text-[10px] text-red-400 max-w-[260px] leading-tight">
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
                  <p className="text-[10px] text-slate-600">
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
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      GitHub Issue Created
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <button
                      onClick={() => void handleFileGitHubIssue()}
                      disabled={githubStatus === "loading"}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[#24292e] hover:bg-[#32383e] disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
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
                    <p className="text-[10px] text-red-400 max-w-[220px] leading-tight">{githubErrorMsg}</p>
                  )}
                </div>

                {/* Self-Heal — shown for Playwright / test-failure results */}
                {isHealEligible && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={handleSelfHealClick}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all bg-sky-600 hover:bg-sky-500 text-white shadow-lg"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Apply Self-Heal Fix
                    </button>
                    {!testCode.trim() && (
                      <p className="text-[10px] text-slate-600 max-w-[200px] leading-tight">
                        Paste the failing test code above first
                      </p>
                    )}
                  </div>
                )}

                {/* Re-Analyze */}
                <button
                  onClick={() => void handleAnalyze()}
                  disabled={isAnalyzing}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all bg-surface-700 hover:bg-surface-600 text-slate-200 border border-surface-600 disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Category tag */}
            {result.category && result.category !== "unknown" && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Category:</span>
                <span className="bg-surface-700 text-slate-400 px-2 py-0.5 rounded font-mono">
                  {result.category}
                </span>
              </div>
            )}
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
