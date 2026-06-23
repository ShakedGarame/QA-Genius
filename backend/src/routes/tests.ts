import { Router, Request, Response } from "express";
import {
  deleteFeature,
  deleteGeneratedTest,
  getGeneratedTestCode,
  listFeatureGroups,
} from "../db.js";
import type { DbUser } from "../db.js";

const router = Router();

router.get("/tests", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  try {
    const features = await listFeatureGroups(userId);
    return res.json({ success: true, features, tests: features.flatMap((g) => g.tests) });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list tests" });
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
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load test" });
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
    return res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
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
    return res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
});

export default router;
