import { RunTestResult, TestFileInfo, InputType } from "../types";
import { buildGitHubTokenHeaders, readGitHubTokenForRequest } from "./githubToken";
import { finishTestRun, mapResultStatus } from "./testRuns";
import { fetchRunArtifacts } from "./artifacts";

const ANALYZER_PENDING_KEY = "qa-genius:pending-analyzer";
const GENERATOR_PENDING_KEY = "qa-genius:pending-generator-run";

/** Poll every ~4.5s for up to ~15 minutes (matches workflow timeout). */
export const CLOUD_RUN_POLL = {
  maxAttempts: 200,
  delayMs: 4500,
} as const;

export interface AnalyzerRoutePayload {
  logs: string;
  source: string;
  autoTrigger: boolean;
  ts: number;
  /** Optional context for Self-Heal — the failing spec code and its DB location */
  testCode?: string;
  featureSlug?: string;
  fileName?: string;
  featureName?: string;
}

/** Payload for loading a saved repository test into Test Generator and optionally auto-running. */
export interface RunInGeneratorPayload {
  file: TestFileInfo;
  code?: string;
  isMock?: boolean;
  inputType?: InputType;
  autoRun?: boolean;
  ts: number;
}

/** Use GitHub Actions cloud runner on Vercel, localhost with PAT, or when env flag is set. */
export function shouldUseGitHubCloudRunner(): boolean {
  if (typeof window === "undefined") return false;
  if (/vercel\.app$/i.test(window.location.hostname)) return true;
  if (import.meta.env.VITE_USE_GITHUB_ACTIONS === "true") return true;
  return Boolean(readGitHubTokenForRequest());
}

export async function pollCloudRunStatus(workflowRunId: number): Promise<RunTestResult> {
  const res = await fetch(`/api/run-test/cloud-status/${workflowRunId}`, {
    credentials: "include",
    headers: buildGitHubTokenHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch cloud status");

  const ghStatus = String(json.status ?? "unknown");

  if (ghStatus !== "completed") {
    return {
      testId: String(workflowRunId),
      status: "running",
      output: String(json.output ?? `Cloud run is ${ghStatus}. Track: ${json.htmlUrl ?? ""}`),
      duration: Number(json.durationMs ?? 0),
      cloudRunId: workflowRunId,
      htmlUrl: typeof json.htmlUrl === "string" ? json.htmlUrl : undefined,
      runner: "github-actions",
    };
  }

  return mapCloudStatusToResult(workflowRunId, json);
}

export async function fetchCloudRunLogs(workflowRunId: number): Promise<RunTestResult> {
  const res = await fetch(`/api/run-test/cloud-logs/${workflowRunId}`, {
    credentials: "include",
    headers: buildGitHubTokenHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch cloud logs");
  return mapCloudStatusToResult(workflowRunId, json);
}

function mapCloudStatusToResult(workflowRunId: number, json: Record<string, unknown>): RunTestResult {
  const passed = Boolean(json.passed);
  const output = String(json.output ?? json.rawLogs ?? "");
  const rawLogs = String(json.rawLogs ?? output);
  return {
    testId: String(workflowRunId),
    status: passed ? "passed" : "failed",
    output,
    rawLogs,
    duration: Number(json.durationMs ?? 0),
    errorDetails: passed ? undefined : String(json.errorDetails ?? rawLogs.slice(0, 1200)),
    cloudRunId: workflowRunId,
    htmlUrl: typeof json.htmlUrl === "string" ? json.htmlUrl : undefined,
    runner: "github-actions",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Persist final run outcome to Supabase when a db run id is known. */
export async function persistRunCompletion(
  testRunId: string | undefined,
  result: RunTestResult
): Promise<void> {
  if (!testRunId || result.status === "running") return;

  // Artifact fetch is best-effort — a failure must NEVER prevent the run
  // from being finalized in Supabase (which would leave it stuck at RUNNING).
  let artifactMeta: Record<string, unknown> | null = null;
  if (result.status === "failed" && result.cloudRunId) {
    try {
      const gallery = await fetchRunArtifacts(result.cloudRunId);
      if (gallery) {
        artifactMeta = {
          artifactCount: gallery.artifacts.length,
          screenshotCount: gallery.screenshots.length,
          artifactNames: gallery.artifacts.map((a) => a.name),
        };
      }
    } catch (err) {
      console.warn("[persistRunCompletion] artifact fetch failed (non-fatal):", err);
    }
  }

  await finishTestRun(testRunId, {
    status: mapResultStatus(result.status),
    ...(result.duration > 0 ? { durationMs: result.duration } : {}),
    gitHubRunId: result.cloudRunId,
    htmlUrl: result.htmlUrl,
    runner: result.runner,
    artifactMeta,
  });
}

/** Poll until GitHub Actions run completes, then download raw logs on failure. */
export async function waitForCloudRunCompletion(
  workflowRunId: number,
  handlers?: {
    onProgress?: (message: string, progress: number) => void;
    onOutput?: (output: string) => void;
  },
  options?: { maxAttempts?: number; delayMs?: number; signal?: AbortSignal }
): Promise<RunTestResult> {
  const maxAttempts = options?.maxAttempts ?? CLOUD_RUN_POLL.maxAttempts;
  const delayMs = options?.delayMs ?? CLOUD_RUN_POLL.delayMs;

  for (let i = 0; i < maxAttempts; i++) {
    if (options?.signal?.aborted) {
      return {
        testId: String(workflowRunId),
        status: "failed",
        output: "Run stopped by user.",
        duration: 0,
        cloudRunId: workflowRunId,
        runner: "github-actions",
      };
    }

    const status = await pollCloudRunStatus(workflowRunId);
    handlers?.onOutput?.(status.output);

    if (status.status === "running") {
      const pct = Math.min(92, 25 + Math.floor((i / maxAttempts) * 65));
      const elapsedSec = Math.round(((i + 1) * delayMs) / 1000);
      handlers?.onProgress?.(
        `⏳ GitHub Actions running… (${elapsedSec}s elapsed)`,
        pct
      );
      await sleep(delayMs);
      continue;
    }

    if (status.status === "passed") {
      handlers?.onProgress?.("✅ Cloud run passed", 100);
      return status;
    }

    if (status.status === "failed" && status.cloudRunId) {
      handlers?.onProgress?.("📋 Downloading raw failure logs…", 96);
      try {
        return await fetchCloudRunLogs(status.cloudRunId);
      } catch {
        return status;
      }
    }

    return status;
  }

  handlers?.onProgress?.("⚠ Polling timed out — fetching latest status…", 94);
  const last = await pollCloudRunStatus(workflowRunId);
  if (last.status === "running") {
    try {
      return await fetchCloudRunLogs(workflowRunId);
    } catch {
      return {
        ...last,
        status: "failed",
        output:
          `${last.output}\n\n⚠ UI polling timed out after ~${Math.round((maxAttempts * delayMs) / 60000)} minutes.\n` +
          "Check GitHub Actions directly for the final result.",
      };
    }
  }
  return last.status === "failed" ? await enrichFailedCloudRun(last) : last;
}

/** Ensure failed cloud runs include downloaded raw GitHub logs in the terminal. */
export async function enrichFailedCloudRun(result: RunTestResult): Promise<RunTestResult> {
  if (result.status !== "failed" || !result.cloudRunId) return result;
  if (hasSubstantialFailureLogs(result)) return result;

  try {
    return await fetchCloudRunLogs(result.cloudRunId);
  } catch {
    return result;
  }
}

function hasSubstantialFailureLogs(result: RunTestResult): boolean {
  const logs = result.rawLogs ?? result.output ?? "";
  if (logs.length < 80) return false;
  if (/^Cloud run is (in_progress|queued)/i.test(logs.trim())) return false;
  return (
    logs.includes("RAW GITHUB ACTIONS LOGS") ||
    /TimeoutError|Error:|FAIL|page\.goto|Navigation to/i.test(logs)
  );
}

/** Client-side fallback when backend SSE ends before GitHub run id is known. */
export async function resolveDispatchRunId(
  dispatchedAfterMs: number,
  handlers?: {
    onProgress?: (message: string, progress: number) => void;
  }
): Promise<number | undefined> {
  for (let i = 0; i < 40; i++) {
    handlers?.onProgress?.(
      `🔍 Resolving GitHub run ID… (${i + 1}/40)`,
      Math.min(24, 20 + i)
    );

    const res = await fetch(
      `/api/run-test/find-dispatch?after=${dispatchedAfterMs}`,
      { credentials: "include", headers: buildGitHubTokenHeaders() }
    );
    const json = await res.json();
    if (res.ok && json.found && json.workflowRunId) {
      return Number(json.workflowRunId);
    }

    await sleep(3000);
  }
  return undefined;
}

/** Resolve final cloud/local result after SSE stream ends. */
export async function resolveCloudRunAfterStream(
  streamResult: RunTestResult | undefined,
  workflowRunId: number | undefined,
  handlers?: {
    onProgress?: (message: string, progress: number) => void;
    onOutput?: (output: string) => void;
  },
  options?: { dispatchedAt?: number; testRunId?: string; signal?: AbortSignal }
): Promise<RunTestResult | null> {
  let runId = streamResult?.cloudRunId ?? workflowRunId;

  if (!runId && options?.dispatchedAt) {
    runId = await resolveDispatchRunId(options.dispatchedAt, handlers);
  }

  const isCloudRun =
    Boolean(runId) &&
    (streamResult?.runner === "github-actions" ||
      shouldUseGitHubCloudRunner() ||
      !streamResult);

  if (isCloudRun && runId) {
    const result = await waitForCloudRunCompletion(runId, handlers, {
      ...CLOUD_RUN_POLL,
      signal: options?.signal,
    });
    return { ...result, testRunId: options?.testRunId ?? streamResult?.testRunId };
  }

  if (!streamResult) return null;

  if (streamResult.status === "failed") {
    return enrichFailedCloudRun(streamResult);
  }

  return streamResult;
}

export interface ExecuteTestRunHandlers {
  onStatus?: (message: string, progress: number) => void;
  onOutputAppend?: (chunk: string) => void;
  onOutputReplace?: (text: string) => void;
  onResult?: (result: RunTestResult) => void;
  onTestRunId?: (testRunId: string) => void;
}

export interface ExecuteTestRunOptions {
  signal?: AbortSignal;
}

/** Unified run flow — used by Generator and Repository tabs. */
export async function executeTestRun(
  body: Record<string, unknown>,
  handlers: ExecuteTestRunHandlers,
  options?: ExecuteTestRunOptions
): Promise<RunTestResult | null> {
  if (options?.signal?.aborted) return null;

  const streamStartedAt = Date.now();
  const res = await fetch("/api/run-test", {
    method: "POST",
    headers: buildRunTestHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  if (options?.signal?.aborted) return null;

  const { pendingWorkflowRunId, streamResult, testRunId, dispatchStartedAt } =
    await consumeRunTestStream(res, {
      onStatus: handlers.onStatus,
      onOutput: handlers.onOutputAppend,
      onResult: handlers.onResult,
      onTestRunId: handlers.onTestRunId,
    });

  if (options?.signal?.aborted) {
    if (testRunId) {
      await finishTestRun(testRunId, { status: "FAILED" });
    }
    return null;
  }

  const finalResult = await resolveCloudRunAfterStream(
    streamResult,
    pendingWorkflowRunId,
    {
      onProgress: handlers.onStatus,
      onOutput: handlers.onOutputReplace,
    },
    {
      dispatchedAt: dispatchStartedAt ?? streamStartedAt,
      testRunId,
      signal: options?.signal,
    }
  );

  if (options?.signal?.aborted) {
    const cancelledId = finalResult?.testRunId ?? testRunId;
    if (cancelledId) {
      await finishTestRun(cancelledId, { status: "FAILED" });
    }
    return null;
  }

  if (!finalResult) return null;

  const merged: RunTestResult = {
    ...finalResult,
    testRunId: finalResult.testRunId ?? testRunId,
  };

  handlers.onResult?.(merged);
  handlers.onOutputReplace?.(merged.output);
  handlers.onStatus?.(
    merged.status === "passed"
      ? "✅ Test passed"
      : merged.status === "failed"
        ? "❌ Test failed"
        : "Run complete",
    100
  );

  void persistRunCompletion(merged.testRunId, merged);
  return merged;
}

/** Pick the best log text for AI analysis (raw logs preferred). */
export function getActionableFailureLogs(
  result: RunTestResult | null | undefined,
  terminalOutput: string
): string {
  const candidates = [
    result?.rawLogs,
    result?.output,
    result?.errorDetails,
    terminalOutput,
  ].filter((c): c is string => Boolean(c?.trim()));

  for (const c of candidates) {
    if (c.includes("RAW GITHUB ACTIONS LOGS") || /TimeoutError|Error:|page\.goto/i.test(c)) {
      return c;
    }
  }

  return candidates[0] ?? "";
}

export async function consumeRunTestStream(
  res: Response,
  handlers: {
    onStatus?: (message: string, progress: number) => void;
    onOutput?: (chunk: string) => void;
    onResult?: (result: RunTestResult) => void;
    onWorkflowRunId?: (workflowRunId: number) => void;
    onTestRunId?: (testRunId: string) => void;
  }
): Promise<{
  pendingWorkflowRunId?: number;
  streamResult?: RunTestResult;
  testRunId?: string;
  dispatchStartedAt?: number;
}> {
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingWorkflowRunId: number | undefined;
  let streamResult: RunTestResult | undefined;
  let testRunId: string | undefined;
  let dispatchStartedAt: number | undefined;

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
          handlers.onStatus?.(data.message ?? "", data.progress ?? 0);
        } else if (eventType === "started" && data.testRunId) {
          testRunId = String(data.testRunId);
          handlers.onTestRunId?.(testRunId);
        } else if (eventType === "output") {
          handlers.onOutput?.(data.text ?? "");
        } else if (eventType === "result") {
          streamResult = data as RunTestResult;
          if (data.testRunId) testRunId = String(data.testRunId);
          handlers.onResult?.(streamResult);
        } else if (eventType === "dispatched" && data.workflowRunId) {
          handlers.onWorkflowRunId?.(Number(data.workflowRunId));
          pendingWorkflowRunId = Number(data.workflowRunId);
          if (data.testRunId) {
            testRunId = String(data.testRunId);
            handlers.onTestRunId?.(testRunId);
          }
          if (data.dispatchedAt) dispatchStartedAt = Number(data.dispatchedAt);
        } else if (eventType === "pending") {
          if (data.dispatchedAt) dispatchStartedAt = Number(data.dispatchedAt);
          if (data.testRunId) {
            testRunId = String(data.testRunId);
            handlers.onTestRunId?.(testRunId);
          }
          handlers.onStatus?.(
            String(data.message ?? "Resolving GitHub run ID…"),
            22
          );
        } else if (eventType === "error") {
          handlers.onOutput?.(`\n⚠ ${data.message}\n`);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return { pendingWorkflowRunId, streamResult, testRunId, dispatchStartedAt };
}

export function buildRunTestHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...buildGitHubTokenHeaders(),
  };
}

export function readPendingAnalyzerPayload(): AnalyzerRoutePayload | null {
  try {
    const raw = sessionStorage.getItem(ANALYZER_PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ANALYZER_PENDING_KEY);
    return JSON.parse(raw) as AnalyzerRoutePayload;
  } catch {
    return null;
  }
}

/** Navigate to Log Analyzer with live failure logs and auto-trigger AI analysis. */
export function routeFailureLogsToAnalyzer(
  logs: string,
  source = "playwright",
  context?: { testCode?: string; featureSlug?: string; fileName?: string; featureName?: string }
): void {
  const trimmed = logs.trim();
  if (!trimmed) return;

  const payload: AnalyzerRoutePayload = {
    logs: trimmed,
    source,
    autoTrigger: true,
    ts: Date.now(),
    ...context,
  };

  sessionStorage.setItem(ANALYZER_PENDING_KEY, JSON.stringify(payload));

  window.dispatchEvent(
    new CustomEvent("qa-genius:populate-log-analyzer", { detail: payload })
  );

  queueMicrotask(() => {
    window.dispatchEvent(
      new CustomEvent("qa-genius:navigate-tab", { detail: { tab: "analyzer" } })
    );
  });
}

/** Load a saved test into Test Generator and optionally auto-start execution. */
export function routeRunToGenerator(
  payload: Omit<RunInGeneratorPayload, "ts">
): void {
  const full: RunInGeneratorPayload = {
    ...payload,
    autoRun: payload.autoRun ?? true,
    ts: Date.now(),
  };

  sessionStorage.setItem(GENERATOR_PENDING_KEY, JSON.stringify(full));
  window.dispatchEvent(
    new CustomEvent("qa-genius:run-test-in-generator", { detail: full })
  );

  queueMicrotask(() => {
    window.dispatchEvent(
      new CustomEvent("qa-genius:navigate-tab", { detail: { tab: "generator" } })
    );
  });
}

export function readPendingGeneratorRun(): RunInGeneratorPayload | null {
  try {
    const raw = sessionStorage.getItem(GENERATOR_PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GENERATOR_PENDING_KEY);
    return JSON.parse(raw) as RunInGeneratorPayload;
  } catch {
    return null;
  }
}

/** @deprecated Use routeRunToGenerator — runs now execute in Test Generator for full-width terminal. */
export function routeRunToRepository(file: TestFileInfo): void {
  routeRunToGenerator({ file, autoRun: true });
}
