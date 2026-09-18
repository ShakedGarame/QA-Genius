import { Router, Request, Response } from "express";
import {
  deleteFeature,
  deleteGeneratedTest,
  getGeneratedTestCode,
  getUserSettings,
  listFeatureGroups,
  updateGeneratedTestCode,
  recordSelfHealEvent,
} from "../db.js";
import type { DbUser } from "../db.js";
import { selfHealTest } from "../services/llm.js";
import { resolveOpenAIKeySource } from "../lib/requestKeys.js";
import { sendError } from "../lib/errors.js";

const router = Router();

interface SelfHealBody {
  testCode?: string;
  errorOutput?: string;
  rootCause?: string;
  suggestedFix?: string;
  featureSlug?: string;
  fileName?: string;
}

router.post("/tests/self-heal", async (req: Request, res: Response) => {
  const user = req.user as DbUser;
  const userId = user.id;
  const { testCode, errorOutput, rootCause, suggestedFix, featureSlug, fileName } =
    req.body as SelfHealBody;

  if (!testCode?.trim()) {
    return res.status(400).json({ error: "'testCode' is required" });
  }
  if (!errorOutput?.trim()) {
    return res.status(400).json({ error: "'errorOutput' is required" });
  }
  if (featureSlug && (featureSlug.includes("..") || featureSlug.includes("/"))) {
    return res.status(400).json({ error: "Invalid featureSlug" });
  }
  if (fileName && (fileName.includes("..") || fileName.includes("/"))) {
    return res.status(400).json({ error: "Invalid fileName" });
  }

  const startedAt = Date.now();
  try {
    const userSettings = await getUserSettings(userId);
    const { key: openaiKey } = resolveOpenAIKeySource(req, userSettings);
    const { healedCode, model, isMock } = await selfHealTest(testCode, errorOutput, {
      openaiKey,
      rootCause,
      suggestedFix,
    });

    let saved = false;
    if (featureSlug && fileName) {
      saved = await updateGeneratedTestCode(userId, featureSlug, fileName, healedCode);
    }

    // Guests have no persisted `users` row (see guest-data-isolation design), so a
    // FK write here would fail — the Dashboard's healing-speed metric is an
    // owner-account feature anyway, same as everything else in History/Dashboard.
    if (!user.is_guest) {
      recordSelfHealEvent(userId, { featureSlug, fileName, durationMs: Date.now() - startedAt, isMock }).catch(
        (err) => console.error("[self-heal] failed to record event:", err)
      );
    }

    return res.json({ success: true, healedCode, model, isMock, saved });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Self-heal failed" });
    return;
  }
});

router.get("/tests", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  try {
    const features = await listFeatureGroups(userId);
    return res.json({ success: true, features, tests: features.flatMap((g) => g.tests) });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to list tests" });
  }
});

router.get("/tests/:featureSlug/:fileName", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { featureSlug, fileName } = req.params;

  if ([featureSlug, fileName].some((p) => p.includes("..") || p.includes("/"))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const code = await getGeneratedTestCode(userId, featureSlug, fileName);
    if (!code) return res.status(404).json({ error: "Test file not found" });
    return res.json({ success: true, featureSlug, fileName, code });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to load test" });
  }
});

router.put("/tests/:featureSlug/:fileName", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { featureSlug, fileName } = req.params;
  const { code } = req.body as { code?: string };

  if ([featureSlug, fileName].some((p) => p.includes("..") || p.includes("/"))) {
    return res.status(400).json({ error: "Invalid path" });
  }
  if (!code?.trim()) {
    return res.status(400).json({ error: "'code' is required" });
  }

  try {
    const saved = await updateGeneratedTestCode(userId, featureSlug, fileName, code);
    if (!saved) return res.status(404).json({ error: "Test file not found" });
    return res.json({ success: true });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Update failed" });
  }
});

router.delete("/tests/:featureSlug/:fileName", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { featureSlug, fileName } = req.params;

  if ([featureSlug, fileName].some((p) => p.includes("..") || p.includes("/"))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const deleted = await deleteGeneratedTest(userId, featureSlug, fileName);
    if (!deleted) return res.status(404).json({ error: "File not found" });
    return res.json({ success: true, message: `Deleted ${featureSlug}/${fileName}` });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Delete failed" });
  }
});

router.delete("/tests/:featureSlug", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { featureSlug } = req.params;

  if (featureSlug.includes("..") || featureSlug.includes("/")) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const deleted = await deleteFeature(userId, featureSlug);
    if (!deleted) return res.status(404).json({ error: "Feature not found" });
    return res.json({ success: true, message: `Deleted feature: ${featureSlug}` });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Delete failed" });
  }
});

export default router;
