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
}

export interface CloudRunStatus {
  runId: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  output: string;
  durationMs: number;
  passed: boolean;
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

  return {
    id: Number(match.id),
    status: String(match.status ?? "queued"),
    conclusion: (match.conclusion as string | null) ?? null,
    htmlUrl: String(match.html_url ?? ""),
    createdAt: String(match.created_at ?? ""),
  };
}

export async function getWorkflowRun(token: string, runId: number): Promise<WorkflowRunInfo> {
  const { owner, repo } = parseRepo();
  const run = await githubJson<Record<string, unknown>>(
    token,
    `/repos/${owner}/${repo}/actions/runs/${runId}`
  );

  return {
    id: Number(run.id),
    status: String(run.status ?? "unknown"),
    conclusion: (run.conclusion as string | null) ?? null,
    htmlUrl: String(run.html_url ?? ""),
    createdAt: String(run.created_at ?? ""),
  };
}

async function buildRunOutput(token: string, runId: number): Promise<string> {
  const { owner, repo } = parseRepo();
  const run = await getWorkflowRun(token, runId);
  const jobsData = await githubJson<{ jobs: Array<Record<string, unknown>> }>(
    token,
    `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`
  );

  const lines: string[] = [
    `GitHub Actions run #${runId}`,
    `Status: ${run.status} · Conclusion: ${run.conclusion ?? "pending"}`,
    `Logs: ${run.htmlUrl}`,
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
      onProgress?.("📋 Fetching cloud run results…", 95);
      const output = await buildRunOutput(token, runId);
      const passed = run.conclusion === "success";
      return {
        runId,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.htmlUrl,
        output,
        durationMs: Date.now() - startedAtMs,
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
    durationMs: Date.now() - startedAtMs,
    passed: false,
  };
}

export async function resolveCloudRunStatus(
  token: string,
  runId: number
): Promise<CloudRunStatus> {
  const startedAtMs = Date.now();
  const run = await getWorkflowRun(token, runId);

  if (run.status !== "completed") {
    return {
      runId,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.htmlUrl,
      output: `Cloud run is ${run.status}. Track: ${run.htmlUrl}`,
      durationMs: 0,
      passed: false,
    };
  }

  const output = await buildRunOutput(token, runId);
  return {
    runId,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.htmlUrl,
    output,
    durationMs: Date.now() - startedAtMs,
    passed: run.conclusion === "success",
  };
}
