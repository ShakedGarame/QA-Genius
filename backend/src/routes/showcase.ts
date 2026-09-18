import { Router, Request, Response } from "express";
import {
  getManualStdById,
  createManualStdShowcase,
  listShowcaseLinks,
  revokeShowcaseLink,
  getShowcaseBySlug,
} from "../db.js";
import type { DbUser } from "../db.js";
import { AppError, sendError } from "../lib/errors.js";

function getUser(req: Request): DbUser | null {
  return (req.user as DbUser) ?? null;
}

// ─── Public: no auth, no ownership check — this is the "case study" view ──────
// Mounted directly on the app (like authRouter), before the requireAuth-gated
// protected router, so an unauthenticated visitor can load it.

export const showcasePublicRouter = Router();

showcasePublicRouter.get("/api/showcase/:slug", async (req: Request, res: Response) => {
  const { slug } = req.params;
  try {
    const view = await getShowcaseBySlug(slug);
    if (!view) return res.status(404).json({ error: "This showcase link doesn't exist or was revoked." });
    return res.json({ success: true, showcase: view });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to load showcase" });
  }
});

// ─── Protected: owner publishes/manages their own showcase links ──────────────
// Mounted inside the protectedRouter in app.ts (requireAuth + ensureDbUser already
// applied there), so `req.user` below is always a real, DB-backed user.

const router = Router();

router.post("/showcase", async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  // Guests have no persisted ManualStd rows to publish from (see guest-data-isolation
  // design doc) — fail with a clear, actionable message rather than a confusing 404.
  if (user.is_guest) {
    return res.status(403).json({ error: "Sign in to publish a showcase link." });
  }

  const { artifactType, sourceId } = req.body as { artifactType?: string; sourceId?: string };
  if (artifactType !== "manual_std" || !sourceId) {
    return res.status(400).json({ error: "artifactType must be 'manual_std' and sourceId is required" });
  }

  try {
    const std = await getManualStdById(user.id, sourceId);
    if (!std) throw new AppError(404, "STD not found");
    const link = await createManualStdShowcase(user.id, std);
    return res.json({ success: true, showcaseLink: link });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to publish showcase link" });
  }
});

router.get("/showcase", async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  try {
    const links = user.is_guest ? [] : await listShowcaseLinks(user.id);
    return res.json({ success: true, showcaseLinks: links });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to list showcase links" });
  }
});

router.delete("/showcase/:id", async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { id } = req.params;

  try {
    const revoked = user.is_guest ? false : await revokeShowcaseLink(user.id, id);
    if (!revoked) return res.status(404).json({ error: "Showcase link not found" });
    return res.json({ success: true });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to revoke showcase link" });
  }
});

export default router;
