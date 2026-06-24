import { RunTestResult } from "../types";
import { buildGitHubTokenHeaders, readGitHubTokenForRequest } from "./githubToken";

const ANALYZER_PENDING_KEY = "qa-genius:pending-analyzer";

export interface AnalyzerRoutePayload {
  logs: string;
  source: string;
  autoTrigger: boolean;
  ts: number;
}

export async function pollCloudRunStatus(workflowRunId: number): Promise<RunTestResult> {
  const res = await fetch(`/api/run-test/cloud-status/${workflowRunId}`, {
    credentials: "include",
    headers: buildGitHubTokenHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch cloud status");

  const ghStatus = String(json.status ?? "unknown");

  // GitHub runs are queued/in_progress until status === "completed"
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

/** Poll until GitHub Actions run completes, then download raw logs on failure. */
export async function waitForCloudRunCompletion(
  workflowRunId: number,
  handlers?: {
    onProgress?: (message: string, progress: number) => void;
    onOutput?: (output: string) => void;
  },
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<RunTestResult> {
  const maxAttempts = options?.maxAttempts ?? 40;
  const delayMs = options?.delayMs ?? 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const status = await pollCloudRunStatus(workflowRunId);
    handlers?.onOutput?.(status.output);

    if (status.status === "running") {
      const pct = Math.min(90, 25 + i * 2);
      const msg = status.output.includes("in_progress")
        ? "🚀 Running Playwright in GitHub Actions…"
        : "⏳ Waiting for GitHub Actions run…";
      handlers?.onProgress?.(msg, pct);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    if (status.status === "failed" && status.cloudRunId) {
      handlers?.onProgress?.("📋 Downloading raw failure logs…", 95);
      try {
        return await fetchCloudRunLogs(status.cloudRunId);
      } catch {
        return status;
      }
    }

    return status;
  }

  return pollCloudRunStatus(workflowRunId);
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
  }
): Promise<{ pendingWorkflowRunId?: number }> {
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingWorkflowRunId: number | undefined;

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
        } else if (eventType === "output") {
          handlers.onOutput?.(data.text ?? "");
        } else if (eventType === "result") {
          handlers.onResult?.(data as RunTestResult);
        } else if (eventType === "dispatched" && data.workflowRunId) {
          handlers.onWorkflowRunId?.(Number(data.workflowRunId));
          pendingWorkflowRunId = Number(data.workflowRunId);
        } else if (eventType === "error") {
          handlers.onOutput?.(`\n⚠ ${data.message}\n`);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return { pendingWorkflowRunId };
}

export function buildRunTestHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...buildGitHubTokenHeaders(),
  };
}

export function requireGitHubTokenForCloudRun(): string | null {
  return readGitHubTokenForRequest();
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
export function routeFailureLogsToAnalyzer(logs: string, source = "playwright"): void {
  const trimmed = logs.trim();
  if (!trimmed) return;

  const payload: AnalyzerRoutePayload = {
    logs: trimmed,
    source,
    autoTrigger: true,
    ts: Date.now(),
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

/** Route to Test Repository tab and select + run a specific test file. */
export function routeRunToRepository(file: {
  relativePath: string;
  featureSlug: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}): void {
  window.dispatchEvent(
    new CustomEvent("qa-genius:navigate-tab", { detail: { tab: "repository" } })
  );
  window.dispatchEvent(
    new CustomEvent("qa-genius:run-test-in-repository", { detail: { file } })
  );
}
