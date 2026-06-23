import { useState } from "react";
import {
  BrainCircuit,
  Loader2,
  AlertTriangle,
  Info,
  Wrench,
  Zap,
  ChevronDown,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import clsx from "clsx";
import { RawLogAnalysisResponse } from "../../types";

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

export default function LogAnalyzerTab() {
  const [source, setSource] = useState<LogSource>("playwright");
  const [rawLogs, setRawLogs] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<RawLogAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSource = LOG_SOURCES.find((s) => s.value === source)!;

  const handleAnalyze = async () => {
    if (!rawLogs.trim()) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/analyze-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rawLogs, source }),
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
              setStatusMessage(data.message ?? "");
            } else if (eventType === "result") {
              setResult(data as RawLogAnalysisResponse);
            } else if (eventType === "error") {
              setError(data.message ?? "Analysis failed");
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
      setStatusMessage("");
    }
  };

  const handleClear = () => {
    setRawLogs("");
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left: Input panel ── */}
      <div className="w-[480px] flex-shrink-0 border-r border-surface-600 flex flex-col">
        <div className="px-5 py-4 border-b border-surface-600">
          <h2 className="text-sm font-semibold text-slate-200 mb-0.5">Instant Log Analyzer</h2>
          <p className="text-xs text-slate-500">
            Paste any logs or errors — AI will explain the root cause in plain language
          </p>
        </div>

        <div className="flex-1 flex flex-col gap-4 p-5 overflow-auto">
          {/* Source dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Log Source
            </label>
            <div className="relative">
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as LogSource);
                  setRawLogs("");
                  setResult(null);
                }}
                className="w-full appearance-none bg-surface-700 border border-surface-500 text-slate-200 text-sm rounded-lg px-4 py-2.5 pr-8 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 cursor-pointer"
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
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Raw Logs / Error Output
            </label>
            <textarea
              value={rawLogs}
              onChange={(e) => setRawLogs(e.target.value)}
              placeholder={activeSource.placeholder}
              className="flex-1 min-h-[240px] w-full bg-surface-800 border border-surface-600 rounded-lg px-4 py-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 resize-none font-mono leading-5"
            />
            <p className="text-[10px] text-slate-600 mt-1 text-right">
              {rawLogs.length.toLocaleString()} characters
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleAnalyze}
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

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Analysis result ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-auto bg-surface-900/50">
        {!result && !isAnalyzing && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-600 space-y-3 p-8">
            <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <BrainCircuit className="w-7 h-7 text-violet-500/40" />
            </div>
            <div>
              <p className="text-slate-500 font-medium">No analysis yet</p>
              <p className="text-sm mt-1">Paste your logs and click "Analyze Logs"</p>
            </div>
            <div className="mt-4 text-xs text-slate-700 space-y-1">
              <p>Supports: Playwright · Coralogix · Node.js · Jest · Docker</p>
              <p>Powered by: OpenAI GPT-4o (or smart mock fallback)</p>
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-violet-400 animate-pulse" />
            </div>
            <div>
              <p className="text-slate-200 font-medium">Analyzing logs…</p>
              <p className="text-sm text-slate-400 mt-1">{statusMessage || "Sending to AI engine"}</p>
            </div>
          </div>
        )}

        {result && !isAnalyzing && (
          <div className="p-6 space-y-5 animate-fade-in">
            {/* Header with severity + mock badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">AI Analysis Complete</p>
                  <p className="text-xs text-slate-500">{activeSource.icon} {activeSource.label}</p>
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
            <div className="rounded-xl bg-surface-800 border border-surface-600 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-orange-400" />
                <p className="text-xs font-bold text-orange-300 uppercase tracking-wider">Root Cause</p>
              </div>
              <p className="text-sm font-semibold text-slate-100 leading-relaxed">{result.rootCause}</p>
            </div>

            {/* Explanation */}
            <div className="rounded-xl bg-surface-800 border border-surface-600 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-sky-400" />
                <p className="text-xs font-bold text-sky-300 uppercase tracking-wider">Technical Explanation</p>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {result.explanation}
              </p>
            </div>

            {/* Suggested fix */}
            <div className="rounded-xl bg-surface-800 border border-emerald-500/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Suggested Fix</p>
              </div>
              <pre className="text-sm text-emerald-200 whitespace-pre-wrap font-mono leading-relaxed">
                {result.suggestedFix}
              </pre>
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
    </div>
  );
}
