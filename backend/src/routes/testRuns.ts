import { Router, Request, Response } from "express";
import {
  createTestRun,
  updateTestRun,
  listTestRuns,
  getTestRunDashboardStats,
  resolveGeneratedTestId,
  type TestRunStatus,
} from "../db.js";
import type { DbUser } from "../db.js";

const router = Router();

router.get("/test-runs", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  try {
    const runs = await listTestRuns(userId, limit);
    res.json({ success: true, runs });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list test runs" });
  }
});

router.get("/test-runs/stats", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  try {
    const stats = await getTestRunDashboardStats(userId);
    res.json({ success: true, ...stats });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load dashboard stats" });
  }
});

router.post("/test-runs", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
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
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create test run" });
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
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update test run" });
  }
});

export default router;
