import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  SidebarPanel,
  PanelHeader,
  PanelBody,
  EmptyState,
  SectionLabel,
  FormTextarea,
  ErrorBanner,
} from "../../components/ui/layout";
import SelfHealModal from "../../components/qa-genius/SelfHealModal";

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
  const [source, setSource] = useState<LogSource>("playwright");
  const [rawLogs, setRawLogs] = useState("");
  const [testCode, setTestCode] = useState("");
  const [featureSlug, setFeatureSlug] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  const [showTestCodeField, setShowTestCodeField] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<RawLogAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfHealOpen, setSelfHealOpen] = useState(false);
  const testCodeRef = useRef<HTMLTextAreaElement>(null);

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

  const handleAnalyze = useCallback(async (logsOverride?: string, sourceOverride?: LogSource) => {
    const logsToAnalyze = logsOverride ?? rawLogs;
    const sourceToUse = sourceOverride ?? source;
    if (!logsToAnalyze.trim()) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/analyze-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildOpenAIKeyHeaders() },
        credentials: "include",
        body: JSON.stringify({ rawLogs: logsToAnalyze, source: sourceToUse }),
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
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
      setStatusMessage("");
    }
  }, [rawLogs, source]);

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

      if (detail.autoTrigger) {
        setTimeout(() => handleAnalyze(detail.logs, incomingSource), 100);
      }
    },
    [handleAnalyze]
  );

  useEffect(() => {
    const pending = readPendingAnalyzerPayload();
    if (pending?.logs) applyPopulate(pending);
  }, [applyPopulate]);

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
    setResult(null);
    setError(null);
    setGithubStatus("idle");
    setGithubTicketUrl(null);
    setGithubErrorMsg(null);
    setJiraStatus("idle");
    setJiraTicketUrl(null);
    setJiraErrorMsg(null);
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
    if (!jiraProjectKey.trim()) {
      setJiraErrorMsg("Project Key is required (e.g. QA, BUG)");
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
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Input panel ── */}
      <SidebarPanel width="w-[480px]">
        <PanelHeader className="flex-col items-start gap-1 !py-4">
          <h2 className="text-sm font-semibold text-slate-200">Instant Log Analyzer</h2>
          <p className="text-xs text-slate-500">
            Paste any logs or errors — AI will explain the root cause in plain language
          </p>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-4 p-5">
          {/* Source dropdown */}
          <div>
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

          {/* Log text area */}
          <div className="flex-1 flex flex-col">
            <SectionLabel>Raw Logs / Error Output</SectionLabel>
            <FormTextarea
              value={rawLogs}
              onChange={(e) => setRawLogs(e.target.value)}
              placeholder={activeSource.placeholder}
              className="flex-1 min-h-[180px]"
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
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium shadow-lg transition-all"
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
                className="px-3 py-2.5 text-slate-400 hover:text-slate-200 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}
        </PanelBody>
      </SidebarPanel>

      {/* ── Right: Analysis result ── */}
      <div className="qa-main-pane overflow-auto">
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
          <div className="p-6 space-y-5 animate-fade-in">
            {/* Header row: icon + title + badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">AI Analysis Complete</p>
                  <p className="text-xs text-slate-500">
                    {activeSource.icon} {activeSource.label}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
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

            {/* Suggested fix */}
            <div className="rounded-xl bg-surface-800 border border-emerald-500/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Suggested Fix
                  </p>
                </div>
              </div>
              <pre className="text-sm text-emerald-200 whitespace-pre-wrap font-mono leading-relaxed">
                {result.suggestedFix}
              </pre>
            </div>

            {/* Self-Heal CTA — shown for Playwright / test-failure results */}
            {isHealEligible && (
              <div className="rounded-xl border bg-surface-800 border-sky-500/25 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">Self-Heal Test Code</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {testCode.trim()
                          ? "AI will rewrite the failing lines — minimum change, all passing tests preserved."
                          : "Click to paste the failing .spec.ts and let AI repair the broken lines."}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleSelfHealClick}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all bg-sky-600 hover:bg-sky-500 text-white shadow-lg"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Self-Heal Test Code
                  </button>
                </div>
              </div>
            )}

            {/* Ticket Dispatch Action Group */}
            <div className="rounded-xl border bg-surface-800 border-surface-600 p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                File as Ticket
              </p>
              <div className="flex flex-wrap gap-3 items-start">
                {/* GitHub Issues */}
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
                      {githubStatus === "loading" ? "Filing Issue…" : "File GitHub Issue"}
                    </button>
                  )}
                  {githubStatus === "error" && githubErrorMsg && (
                    <p className="text-[10px] text-red-400 max-w-[220px] leading-tight">{githubErrorMsg}</p>
                  )}
                </div>

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
                        {jiraStatus === "loading" ? "Filing Ticket…" : "File Jira Ticket"}
                      </button>
                    )}
                  </div>
                  {(jiraStatus === "error" || jiraErrorMsg) && (
                    <p className="text-[10px] text-red-400 max-w-[260px] leading-tight">{jiraErrorMsg}</p>
                  )}
                  <p className="text-[10px] text-slate-600">Enter project key, then file ticket</p>
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
