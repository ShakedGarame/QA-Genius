import type { DashboardStats, TestRunRecord, TestRunStatus } from "../types";

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch("/api/test-runs/stats", { credentials: "include" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to load dashboard stats");
  return {
    totalRuns: Number(json.totalRuns ?? 0),
    completedRuns: Number(json.completedRuns ?? 0),
    runningRuns: Number(json.runningRuns ?? 0),
    passedRuns: Number(json.passedRuns ?? 0),
    failedRuns: Number(json.failedRuns ?? 0),
    passRatePercent: json.passRatePercent != null ? Number(json.passRatePercent) : null,
    averageDurationMs: json.averageDurationMs != null ? Number(json.averageDurationMs) : null,
    recentRuns: (json.recentRuns ?? []) as TestRunRecord[],
  };
}

export async function finishTestRun(
  testRunId: string,
  data: {
    status: TestRunStatus;
    durationMs?: number;
    gitHubRunId?: number;
    htmlUrl?: string;
    runner?: string;
    artifactMeta?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    await fetch(`/api/test-runs/${testRunId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    window.dispatchEvent(new CustomEvent("qa-genius:test-runs-changed"));
  } catch (err) {
    console.error("Failed to persist test run:", err);
  }
}

export function mapResultStatus(status: string): TestRunStatus {
  if (status === "passed") return "PASSED";
  if (status === "running") return "RUNNING";
  return "FAILED";
}

/** Mark a stuck or user-cancelled run as failed in Supabase. */
export async function cancelTestRun(testRunId: string): Promise<void> {
  await finishTestRun(testRunId, { status: "FAILED" });
}
