import AdmZip from "adm-zip";

const GITHUB_API = "https://api.github.com";
const DEFAULT_REPO = process.env.GITHUB_ACTIONS_REPO ?? "ShakedGarame/QA-Genius";

export interface CloudRunPayload {
  runId: string;
  relativePath: string;
  testCodeB64: string;
  baseUrl?: string;
}

export interface WorkflowRunInfo {
  id: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  runStartedAt: string | null;
}

/** Elapsed workflow time from GitHub timestamps (updated_at − run_started_at). */
export function computeWorkflowDurationMs(
  run: Pick<WorkflowRunInfo, "createdAt" | "updatedAt" | "runStartedAt" | "status">,
  nowMs = Date.now()
): number {
  const startMs = new Date(run.runStartedAt ?? run.createdAt).getTime();
  const isTerminal = run.status === "completed" || run.status === "cancelled";
  const endMs =
    run.updatedAt && isTerminal
      ? new Date(run.updatedAt).getTime()
      : nowMs;
  const duration = endMs - startMs;
  return duration > 0 ? duration : 0;
}

function mapWorkflowRun(row: Record<string, unknown>): WorkflowRunInfo {
  return {
    id: Number(row.id),
    status: String(row.status ?? "unknown"),
    conclusion: (row.conclusion as string | null) ?? null,
    htmlUrl: String(row.html_url ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    runStartedAt: row.run_started_at ? String(row.run_started_at) : null,
  };
}

export interface CloudRunStatus {
  runId: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  output: string;
  rawLogs: string;
  durationMs: number;
  passed: boolean;
  errorDetails?: string;
}

function parseRepo(slug = DEFAULT_REPO): { owner: string; repo: string } {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) throw new Error("Invalid GITHUB_ACTIONS_REPO — expected owner/repo");
  return { owner, repo };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function githubJson<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...githubHeaders(token), ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export async function triggerPlaywrightWorkflow(
  token: string,
  payload: CloudRunPayload
): Promise<void> {
  const { owner, repo } = parseRepo();
  await githubJson(token, `/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    body: JSON.stringify({
      event_type: "trigger-playwright-test",
      client_payload: {
        run_id: payload.runId,
        relative_path: payload.relativePath,
        test_code_b64: payload.testCodeB64,
        base_url: payload.baseUrl ?? process.env.BASE_URL ?? "https://example.com",
      },
    }),
  });
}

export async function findDispatchRun(
  token: string,
  dispatchedAfterMs: number
): Promise<WorkflowRunInfo | null> {
  const { owner, repo } = parseRepo();
  const data = await githubJson<{ workflow_runs: Array<Record<string, unknown>> }>(
    token,
    `/repos/${owner}/${repo}/actions/runs?event=repository_dispatch&per_page=10`
  );

  const match = (data.workflow_runs ?? []).find((run) => {
    const created = new Date(String(run.created_at)).getTime();
    return created >= dispatchedAfterMs - 5000;
  });

  if (!match) return null;

  return mapWorkflowRun(match);
}

export async function getWorkflowRun(token: string, runId: number): Promise<WorkflowRunInfo> {
  const { owner, repo } = parseRepo();
  const run = await githubJson<Record<string, unknown>>(
    token,
    `/repos/${owner}/${repo}/actions/runs/${runId}`
  );

  return mapWorkflowRun(run);
}

export async function fetchRawWorkflowLogs(token: string, runId: number): Promise<string> {
  const { owner, repo } = parseRepo();
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}/logs`, {
    headers: githubHeaders(token),
    redirect: "follow",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub logs download failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const parts: string[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    parts.push(`\n${"=".repeat(72)}\n${entry.entryName}\n${"=".repeat(72)}\n`);
    parts.push(entry.getData().toString("utf8"));
  }

  return parts.join("\n").trim() || "No log files found in GitHub Actions archive.";
}

export interface WorkflowArtifactInfo {
  id: number;
  name: string;
  sizeBytes: number;
}

export interface RunArtifactGallery {
  artifacts: WorkflowArtifactInfo[];
  screenshots: Array<{ name: string; dataUrl: string }>;
}

async function downloadArtifactZip(token: string, artifactId: number): Promise<Buffer> {
  const { owner, repo } = parseRepo();
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`,
    { headers: githubHeaders(token), redirect: "follow" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Artifact download failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** List workflow artifacts and extract failure screenshot thumbnails from zip archives. */
export async function fetchRunArtifacts(token: string, runId: number): Promise<RunArtifactGallery> {
  const { owner, repo } = parseRepo();
  const data = await githubJson<{
    artifacts: Array<{ id: number; name: string; size_in_bytes: number }>;
  }>(token, `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);

  const artifacts: WorkflowArtifactInfo[] = (data.artifacts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    sizeBytes: a.size_in_bytes,
  }));

  const screenshots: Array<{ name: string; dataUrl: string }> = [];

  // Accept ANY artifact whose name looks related to playwright/failures; also
  // accept all artifacts when there is only one (common pattern for the
  // playwright-failure-<runId> artifact naming in our workflow).
  const candidateArtifacts =
    artifacts.length === 1
      ? artifacts
      : artifacts.filter((a) => /playwright|test.?results?|screenshot|failure/i.test(a.name));

  for (const artifact of candidateArtifacts) {
    try {
      const zipBuffer = await downloadArtifactZip(token, artifact.id);
      const zip = new AdmZip(zipBuffer);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const lower = entry.entryName.toLowerCase();
        // Accept PNG, JPEG, WEBP screenshots
        if (!/\.(png|jpe?g|webp)$/.test(lower)) continue;
        // Skip tiny files (icons, logos) – real screenshots are typically >5 KB
        const data = entry.getData();
        if (data.length < 4 * 1024) continue;
        const base64 = data.toString("base64");
        const ext = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" : lower.endsWith(".webp") ? "webp" : "png";
        const fileName = entry.entryName.split("/").pop() ?? entry.entryName;
        screenshots.push({
          name: fileName,
          dataUrl: `data:image/${ext};base64,${base64}`,
        });
      }
    } catch (err) {
      console.warn(`[artifacts] Could not read zip for artifact ${artifact.id} (${artifact.name}):`, err);
    }
  }

  return { artifacts, screenshots };
}

function extractFailureSnippet(rawLogs: string): string {
  const lines = rawLogs.split("\n");
  const hits = lines.filter((line) =>
    /error|failed|timeout|expect\(|✘|✗|FAIL|page\.goto|Navigation to/i.test(line)
  );
  if (hits.length === 0) return rawLogs.slice(0, 1200);
  return hits.slice(0, 40).join("\n");
}

async function buildRunSummary(token: string, runId: number): Promise<string> {
  const { owner, repo } = parseRepo();
  const run = await getWorkflowRun(token, runId);
  const jobsData = await githubJson<{ jobs: Array<Record<string, unknown>> }>(
    token,
    `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`
  );

  const lines: string[] = [
    `GitHub Actions run #${runId}`,
    `Status: ${run.status} · Conclusion: ${run.conclusion ?? "pending"}`,
    `Track: ${run.htmlUrl}`,
    "",
  ];

  for (const job of jobsData.jobs ?? []) {
    lines.push(`Job: ${job.name} (${job.conclusion ?? job.status})`);
    for (const step of (job.steps as Array<Record<string, unknown>> | undefined) ?? []) {
      const ok = step.conclusion === "success";
      lines.push(`  ${ok ? "✓" : "✗"} ${step.name}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function buildCloudRunOutput(
  token: string,
  runId: number,
  passed: boolean
): Promise<{ output: string; rawLogs: string; errorDetails?: string }> {
  const summary = await buildRunSummary(token, runId);

  if (passed) {
    return { output: summary, rawLogs: summary };
  }

  let rawLogs = summary;
  try {
    rawLogs = await fetchRawWorkflowLogs(token, runId);
  } catch (err) {
    rawLogs = `${summary}\n\n⚠ Could not download raw logs: ${err instanceof Error ? err.message : "unknown error"}`;
  }

  const output = [
    summary,
    "",
    "=".repeat(72),
    "RAW GITHUB ACTIONS LOGS",
    "=".repeat(72),
    "",
    rawLogs,
  ].join("\n");

  return {
    output,
    rawLogs,
    errorDetails: extractFailureSnippet(rawLogs),
  };
}

export async function waitForWorkflowCompletion(
  token: string,
  runId: number,
  startedAtMs: number,
  onProgress?: (message: string, progress: number) => void
): Promise<CloudRunStatus> {
  const maxAttempts = 40;
  const delayMs = 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const run = await getWorkflowRun(token, runId);
    const progress = Math.min(90, 20 + attempt * 2);

    if (run.status === "queued") {
      onProgress?.("🤖 Cloud runner queued on GitHub Actions…", progress);
    } else if (run.status === "in_progress") {
      onProgress?.("🚀 Installing browsers & running Playwright in the cloud…", progress);
    } else if (run.status === "completed") {
      onProgress?.("📋 Downloading raw GitHub Actions logs…", 95);
      const passed = run.conclusion === "success";
      const built = await buildCloudRunOutput(token, runId, passed);
      return {
        runId,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.htmlUrl,
        output: built.output,
        rawLogs: built.rawLogs,
        durationMs: computeWorkflowDurationMs(run),
        passed,
      };
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  const run = await getWorkflowRun(token, runId);
  return {
    runId,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.htmlUrl,
    output:
      `Cloud run still ${run.status} after polling.\n` +
      `Track progress: ${run.htmlUrl}\n` +
      `Re-check status from the app or GitHub Actions tab.`,
    rawLogs: "",
    durationMs: computeWorkflowDurationMs(run),
    passed: false,
  };
}

export async function resolveCloudRunStatus(
  token: string,
  runId: number
): Promise<CloudRunStatus> {
  const run = await getWorkflowRun(token, runId);
  const durationMs = computeWorkflowDurationMs(run);

  if (run.status !== "completed") {
    return {
      runId,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.htmlUrl,
      output: `Cloud run is ${run.status}. Track: ${run.htmlUrl}`,
      rawLogs: "",
      durationMs,
      passed: false,
    };
  }

  const passed = run.conclusion === "success";
  const built = await buildCloudRunOutput(token, runId, passed);

  return {
    runId,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.htmlUrl,
    output: built.output,
    rawLogs: built.rawLogs,
    durationMs,
    passed,
    errorDetails: built.errorDetails,
  };
}
