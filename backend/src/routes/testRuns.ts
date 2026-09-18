import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  createTestRun,
  updateTestRun,
  listTestRuns,
  getTestRunDashboardStats,
  resolveGeneratedTestId,
  type TestRunStatus,
  type DbTestRun,
} from "../db.js";
import type { DbUser } from "../db.js";
import { sendError } from "../lib/errors.js";

const router = Router();

router.get("/test-runs", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  try {
    const runs = await listTestRuns(userId, limit);
    res.json({ success: true, runs });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to list test runs" });
  }
});

router.get("/test-runs/stats", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  try {
    const stats = await getTestRunDashboardStats(userId);
    res.json({ success: true, ...stats });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to load dashboard stats" });
  }
});

router.post("/test-runs", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const isGuest = !!(req.user as DbUser).is_guest;
  const {
    featureName,
    testFileName,
    relativePath,
    testFileId,
    gitHubRunId,
    runner,
  } = req.body as {
    featureName?: string;
    testFileName?: string;
    relativePath?: string;
    testFileId?: string;
    gitHubRunId?: number | string;
    runner?: string;
  };

  if (!featureName?.trim()) {
    return res.status(400).json({ error: "featureName is required" });
  }

  try {
    // Guests never get a persisted TestRun row (see guest-data-isolation
    // design) — hand back a same-shaped, never-saved run instead.
    if (isGuest) {
      const now = new Date().toISOString();
      const run: DbTestRun = {
        id: randomUUID(),
        user_id: userId,
        test_file_id: testFileId ?? null,
        feature_name: featureName.trim(),
        test_file_name: testFileName ?? null,
        relative_path: relativePath ?? null,
        status: "RUNNING",
        duration_ms: 0,
        github_run_id: gitHubRunId != null ? String(gitHubRunId) : null,
        runner: runner ?? "local",
        html_url: null,
        artifact_meta: null,
        created_at: now,
        updated_at: now,
      };
      return res.status(201).json({ success: true, run });
    }

    const resolvedTestFileId =
      testFileId ?? (relativePath ? await resolveGeneratedTestId(userId, relativePath) : null);

    const run = await createTestRun(userId, {
      testFileId: resolvedTestFileId,
      featureName: featureName.trim(),
      testFileName: testFileName ?? null,
      relativePath: relativePath ?? null,
      gitHubRunId: gitHubRunId ?? null,
      runner: runner ?? "local",
    });

    res.status(201).json({ success: true, run });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to create test run. Please try again." });
  }
});

router.patch("/test-runs/:id", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { id } = req.params;
  const {
    status,
    durationMs,
    gitHubRunId,
    htmlUrl,
    runner,
    artifactMeta,
  } = req.body as {
    status?: TestRunStatus;
    durationMs?: number;
    gitHubRunId?: number | string;
    htmlUrl?: string;
    runner?: string;
    artifactMeta?: Record<string, unknown> | null;
  };

  try {
    const run = await updateTestRun(userId, id, {
      status,
      durationMs,
      gitHubRunId,
      htmlUrl,
      runner,
      artifactMeta,
    });

    if (!run) return res.status(404).json({ error: "Test run not found" });
    res.json({ success: true, run });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to update test run. Please try again." });
  }
});

export default router;
