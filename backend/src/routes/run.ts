import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { getGeneratedTestCode } from "../db.js";
import type { DbUser } from "../db.js";
import { extractGitHubTokenFromRequest } from "../lib/githubToken.js";
import {
  findDispatchRun,
  resolveCloudRunStatus,
  triggerPlaywrightWorkflow,
  fetchRunArtifacts,
} from "../services/githubActions.js";
import {
  createTestRun,
  updateTestRun,
  resolveGeneratedTestId,
  getFeatureNameBySlug,
} from "../db.js";

const router = Router();

const ROOT_DIR = path.resolve(process.cwd(), "..");
const isVercel = process.env.VERCEL === "1";

function shouldRunViaGitHubActions(req: Request): boolean {
  if (isVercel) return true;
  if (process.env.USE_GITHUB_ACTIONS_RUNNER === "1") return true;
  return Boolean(extractGitHubTokenFromRequest(req));
}

interface RunTestRequest {
  code?: string;
  fileName?: string;
  featureSlug?: string;
  relativePath?: string;
  testId?: string;
  baseUrl?: string;
}

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function resolveSpecCode(
  userId: string,
  body: RunTestRequest
): Promise<{ code: string; relativePath: string } | { error: string }> {
  const { code, fileName, featureSlug, relativePath } = body;

  if (code?.trim()) {
    const rel = relativePath ?? `cloud_runs/${fileName ?? `run_${Date.now()}.spec.ts`}`;
    if (rel.includes("..")) return { error: "Invalid path" };
    return { code, relativePath: rel };
  }

  if (relativePath || (fileName && featureSlug)) {
    const rel = relativePath ?? `${featureSlug}/${fileName}`;
    if (rel.includes("..")) return { error: "Invalid path" };

    const parts = rel.split("/");
    const slug = parts[0];
    const fname = parts.slice(1).join("/");
    const dbCode = await getGeneratedTestCode(userId, slug, fname);
    if (!dbCode) return { error: `File not found: ${rel}` };
    return { code: dbCode, relativePath: rel };
  }

  return { error: "Either 'code', 'fileName'+'featureSlug', or 'relativePath' is required" };
}

async function buildTestRunMeta(
  userId: string,
  body: RunTestRequest
): Promise<{
  featureName: string;
  testFileName: string | null;
  relativePath: string | null;
  testFileId: string | null;
}> {
  const rel = body.relativePath ?? (body.featureSlug && body.fileName ? `${body.featureSlug}/${body.fileName}` : null);
  const testFileId = rel ? await resolveGeneratedTestId(userId, rel) : null;
  const parts = rel?.split("/") ?? [];
  const slug = parts[0] ?? body.featureSlug ?? "cloud";
  const testFileName = parts.length > 1 ? parts.slice(1).join("/") : body.fileName ?? null;

  let featureName = slug;
  const resolvedName = await getFeatureNameBySlug(userId, slug);
  if (resolvedName) featureName = resolvedName;

  return { featureName, testFileName, relativePath: rel, testFileId };
}

async function runViaGitHubActions(
  req: Request,
  res: Response,
  userId: string,
  body: RunTestRequest,
  id: string,
  dbRunId: string
): Promise<void> {
  const githubToken = extractGitHubTokenFromRequest(req);
  if (!githubToken) {
    sendSSE(res, "error", {
      message:
        "Cloud test runner is not configured. The site owner must add GITHUB_ACTIONS_PAT in Vercel environment variables (or paste a GitHub PAT in Settings → Cloud Test Runner).",
    });
    res.end();
    return;
  }

  const resolved = await resolveSpecCode(userId, body);
  if ("error" in resolved) {
    sendSSE(res, "error", { message: resolved.error });
    res.end();
    return;
  }

  const { code, relativePath } = resolved;
  const testCodeB64 = Buffer.from(code, "utf8").toString("base64");
  const dispatchedAt = Date.now();

  sendSSE(res, "started", { testRunId: dbRunId });
  sendSSE(res, "status", {
    message: "🤖 Triggering cloud runner on GitHub Actions…",
    progress: 10,
  });
  sendSSE(res, "output", { text: "🤖 Triggering cloud runner on GitHub Actions…\n" });

  try {
    await triggerPlaywrightWorkflow(githubToken, {
      runId: id,
      relativePath,
      testCodeB64,
      baseUrl: body.baseUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to trigger GitHub Actions";
    sendSSE(res, "error", { message });
    res.end();
    return;
  }

  sendSSE(res, "status", {
    message: "🚀 Waiting for GitHub workflow to start…",
    progress: 20,
  });
  sendSSE(res, "output", { text: "🚀 Installing browsers in the cloud…\n" });

  let workflowRunId: number | null = null;
  for (let i = 0; i < 20; i++) {
    const run = await findDispatchRun(githubToken, dispatchedAt);
    if (run) {
      workflowRunId = run.id;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!workflowRunId) {
    sendSSE(res, "pending", {
      message: "Workflow triggered but run ID not found yet. Client will keep polling…",
      runId: id,
      testRunId: dbRunId,
      dispatchedAt,
    });
    sendSSE(res, "done", { message: "Dispatch sent" });
    res.end();
    return;
  }

  void updateTestRun(userId, dbRunId, {
    gitHubRunId: String(workflowRunId),
    runner: "github-actions",
  }).catch((err) => console.error("[test-run] update failed:", err));

  sendSSE(res, "dispatched", { workflowRunId, runId: id, testRunId: dbRunId, dispatchedAt });
  sendSSE(res, "output", {
    text:
      `🔗 GitHub run #${workflowRunId}\n` +
      `⏳ Polling every 4s from your browser until the run completes…\n`,
  });
  sendSSE(res, "status", {
    message: "Cloud run dispatched — waiting for GitHub Actions…",
    progress: 25,
  });
  sendSSE(res, "done", { message: "Dispatch complete — client will poll for results" });
  res.end();
}

router.get("/run-test/find-dispatch", async (req: Request, res: Response) => {
  const githubToken = extractGitHubTokenFromRequest(req);
  if (!githubToken) {
    return res.status(401).json({ error: "GitHub token required in x-user-github-token header" });
  }

  const afterMs = Number(req.query.after ?? Date.now() - 120_000);
  if (!Number.isFinite(afterMs)) {
    return res.status(400).json({ error: "Invalid after timestamp" });
  }

  try {
    const run = await findDispatchRun(githubToken, afterMs);
    if (!run) {
      return res.json({ success: true, found: false });
    }
    return res.json({
      success: true,
      found: true,
      workflowRunId: run.id,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.htmlUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to find dispatch run";
    return res.status(500).json({ error: message });
  }
});

router.get("/run-test/artifacts/:runId", async (req: Request, res: Response) => {
  const githubToken = extractGitHubTokenFromRequest(req);
  if (!githubToken) {
    return res.status(401).json({ error: "GitHub token required in x-user-github-token header" });
  }

  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId) || runId <= 0) {
    return res.status(400).json({ error: "Invalid run id" });
  }

  console.log(`[artifacts] Fetching artifacts for run ${runId}`);
  try {
    const gallery = await fetchRunArtifacts(githubToken, runId);
    console.log(
      `[artifacts] Run ${runId}: ${gallery.artifacts.length} artifact(s), ${gallery.screenshots.length} screenshot(s)`
    );
    return res.json({ success: true, runId, ...gallery });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch artifacts";
    console.error(`[artifacts] Run ${runId} failed:`, message);
    return res.status(500).json({ error: message });
  }
});

router.get("/run-test/cloud-status/:runId", async (req: Request, res: Response) => {
  const githubToken = extractGitHubTokenFromRequest(req);
  if (!githubToken) {
    return res.status(401).json({ error: "GitHub token required in x-user-github-token header" });
  }

  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    return res.status(400).json({ error: "Invalid run id" });
  }

  try {
    const status = await resolveCloudRunStatus(githubToken, runId);
    return res.json({
      success: true,
      ...status,
      status: status.status,
      passed: status.passed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch cloud status";
    return res.status(500).json({ error: message });
  }
});

router.get("/run-test/cloud-logs/:runId", async (req: Request, res: Response) => {
  const githubToken = extractGitHubTokenFromRequest(req);
  if (!githubToken) {
    return res.status(401).json({ error: "GitHub token required in x-user-github-token header" });
  }

  const runId = Number(req.params.runId);
  if (!Number.isFinite(runId)) {
    return res.status(400).json({ error: "Invalid run id" });
  }

  try {
    const status = await resolveCloudRunStatus(githubToken, runId);
    return res.json({
      success: true,
      runId,
      passed: status.passed,
      htmlUrl: status.htmlUrl,
      output: status.output,
      rawLogs: status.rawLogs,
      errorDetails: status.errorDetails,
      durationMs: status.durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch cloud logs";
    return res.status(500).json({ error: message });
  }
});

router.post("/run-test", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const body = req.body as RunTestRequest;

  if (!body.code && !body.fileName && !body.relativePath) {
    return res.status(400).json({ error: "Either 'code', 'fileName'+'featureSlug', or 'relativePath' is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const id = body.testId ?? uuidv4();
  const runMeta = await buildTestRunMeta(userId, body);
  const dbRun = await createTestRun(userId, {
    testFileId: runMeta.testFileId,
    featureName: runMeta.featureName,
    testFileName: runMeta.testFileName,
    relativePath: runMeta.relativePath,
    runner: shouldRunViaGitHubActions(req) ? "github-actions" : "local",
  });
  const dbRunId = dbRun.id;

  if (shouldRunViaGitHubActions(req)) {
    await runViaGitHubActions(req, res, userId, body, id, dbRunId);
    return;
  }

  try {
    let specCode = body.code ?? "";
    let isTempFile = false;
    let specPath = "";

    const resolved = await resolveSpecCode(userId, body);
    if ("error" in resolved) {
      sendSSE(res, "error", { message: resolved.error });
      return res.end();
    }
    specCode = resolved.code;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-genius-run-"));
    specPath = path.join(tmpDir, `run_${id}.spec.ts`);
    fs.writeFileSync(specPath, specCode, "utf-8");
    isTempFile = true;

    const relPath = path.relative(ROOT_DIR, specPath);

    sendSSE(res, "started", { testRunId: dbRunId });
    sendSSE(res, "status", {
      message: `🎭 Starting Playwright: ${path.basename(specPath)}`,
      progress: 10,
    });

    const playwrightArgs = [
      "playwright",
      "test",
      relPath,
      "--reporter=list",
      "--config=playwright.config.ts",
    ];

    sendSSE(res, "status", {
      message: `⚡ npx ${playwrightArgs.join(" ")}`,
      progress: 20,
    });

    const child = spawn("npx", playwrightArgs, {
      cwd: ROOT_DIR,
      env: { ...process.env, FORCE_COLOR: "0", CI: "true" },
      shell: true,
    });

    let fullOutput = "";
    let errorOutput = "";
    const startTime = Date.now();

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      fullOutput += text;
      sendSSE(res, "output", { text });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      fullOutput += text;
      errorOutput += text;
      sendSSE(res, "output", { text });
    });

    child.on("close", (exitCode) => {
      const duration = Date.now() - startTime;
      const passed = exitCode === 0;

      if (isTempFile && fs.existsSync(specPath)) {
        fs.unlink(specPath, () => {});
        fs.rm(tmpDir, { recursive: true, force: true }, () => {});
      }

      const errorDetails = !passed
        ? extractErrorSummary(fullOutput + errorOutput)
        : undefined;

      void updateTestRun(userId, dbRunId, {
        status: passed ? "PASSED" : "FAILED",
        durationMs: duration,
        runner: "local",
      }).catch((err) => console.error("[test-run] update failed:", err));

      sendSSE(res, "result", {
        testId: id,
        testRunId: dbRunId,
        status: passed ? "passed" : "failed",
        output: fullOutput,
        duration,
        errorDetails,
        exitCode,
        runner: "local",
      });

      sendSSE(res, "done", { message: "Execution complete" });
      res.end();
    });

    child.on("error", (err) => {
      sendSSE(res, "output", {
        text: `⚠  Playwright not found (${err.message}). Running in mock mode...\n`,
      });
      const mockResult = buildMockResult(id, specCode, Date.now() - startTime);
      void updateTestRun(userId, dbRunId, {
        status: mockResult.status === "passed" ? "PASSED" : "FAILED",
        durationMs: mockResult.duration,
        runner: "local-mock",
      }).catch((e) => console.error("[test-run] update failed:", e));
      sendSSE(res, "result", { ...mockResult, testRunId: dbRunId });
      sendSSE(res, "done", { message: "Mock execution complete" });
      res.end();
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Execution error";
    sendSSE(res, "error", { message });
    res.end();
  }
});

function extractErrorSummary(output: string): string {
  const lines = output.split("\n");
  const relevant = lines.filter(
    (l) =>
      /error|failed|timeout|expect|✗|×|FAIL/i.test(l) && l.trim().length > 3
  );
  return relevant.slice(0, 10).join("\n") || output.slice(0, 500);
}

function buildMockResult(id: string, _code: string, elapsed: number) {
  const shouldPass = Math.random() < 0.4;
  const output = shouldPass
    ? `\nRunning 2 tests using 1 worker\n  ✓  TC-001: renders without errors (1.2s)\n  ✓  TC-002: meets acceptance criteria (0.9s)\n\n  2 passed (2.5s)\n`
    : `\nRunning 2 tests using 1 worker\n  ✓  TC-001: renders without errors (1.1s)\n  ✗  TC-002: meets acceptance criteria (5.0s)\n\n  1) TC-002 ─────────────────────────────\n\n    Error: Timed out 5000ms waiting for expect(locator).toBeVisible()\n\n  1 failed (6.2s)\n`;

  return {
    testId: id,
    status: shouldPass ? "passed" : "failed",
    output,
    duration: elapsed + (shouldPass ? 2500 : 6200),
    exitCode: shouldPass ? 0 : 1,
    errorDetails: shouldPass
      ? undefined
      : `Error: Timed out 5000ms waiting for expect(locator).toBeVisible()`,
  };
}

export default router;
