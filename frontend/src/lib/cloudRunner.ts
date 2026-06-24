import { RunTestResult } from "../types";
import { buildGitHubTokenHeaders, readGitHubTokenForRequest } from "./githubToken";

export async function pollCloudRunStatus(workflowRunId: number): Promise<RunTestResult> {
  const res = await fetch(`/api/run-test/cloud-status/${workflowRunId}`, {
    credentials: "include",
    headers: buildGitHubTokenHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch cloud status");

  return {
    testId: String(workflowRunId),
    status: json.passed ? "passed" : "failed",
    output: json.output ?? "",
    duration: json.durationMs ?? 0,
    errorDetails: json.passed ? undefined : json.output?.slice(0, 800),
  };
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
