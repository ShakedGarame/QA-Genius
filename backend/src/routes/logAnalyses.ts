import { Router, Request, Response } from "express";
import type { DbUser } from "../db.js";
import { deleteLogAnalysis, getLogAnalysisById, listLogAnalyses } from "../db.js";

const router = Router();

router.get("/log-analyses", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  try {
    const analyses = await listLogAnalyses(userId);
    return res.json({ success: true, analyses });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list analyses" });
  }
});

router.get("/log-analyses/:id", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { id } = req.params;

  try {
    const analysis = await getLogAnalysisById(userId, id);
    if (!analysis) return res.status(404).json({ error: "Analysis not found" });
    return res.json({ success: true, analysis });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load analysis" });
  }
});

router.delete("/log-analyses/:id", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { id } = req.params;

  try {
    const deleted = await deleteLogAnalysis(userId, id);
    if (!deleted) return res.status(404).json({ error: "Analysis not found" });
    return res.json({ success: true, message: "Analysis deleted" });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete analysis" });
  }
});

export default router;
