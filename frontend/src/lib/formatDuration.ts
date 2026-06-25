/**
 * Convert milliseconds into a human-readable duration for E2E test runs.
 * Never shows raw milliseconds in the dashboard — always seconds or higher.
 *
 * - >= 1 hour  → HH:MM:SS (e.g. "01:05:24")
 * - >= 1 minute → MMm SSs (e.g. "01m 24s")
 * - < 1 minute  → Ns (sub-second values round up, e.g. 866ms → "1s")
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "N/A";

  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":");
  }

  if (minutes > 0) {
    return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${totalSeconds}s`;
}

/** Dashboard/table display — flags suspiciously fast cached passes. */
export function formatDashboardDuration(
  ms: number | null | undefined,
  status?: string
): string {
  if (ms == null || ms <= 0) return "N/A";
  if (status === "PASSED" && ms < 2000) return "< 5s";
  return formatDuration(ms);
}

/** Runs still marked RUNNING within this window may show an active Stop control. */
export const ACTIVE_RUN_WINDOW_MS = 30 * 60 * 1000;

export function isRunActivelyRunning(
  status: string,
  createdAt: string,
  now = Date.now()
): boolean {
  if (status !== "RUNNING") return false;
  return now - new Date(createdAt).getTime() < ACTIVE_RUN_WINDOW_MS;
}

export function getRunStatusDisplay(
  status: string,
  createdAt: string
): { label: string; tone: "passed" | "failed" | "running" | "stale" } {
  if (status === "RUNNING" && !isRunActivelyRunning(status, createdAt)) {
    return { label: "STALE", tone: "stale" };
  }
  if (status === "PASSED") return { label: "PASSED", tone: "passed" };
  if (status === "FAILED") return { label: "FAILED", tone: "failed" };
  return { label: status, tone: "running" };
}
