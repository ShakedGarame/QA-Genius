import { Router, type Request, type Response } from "express";
import { z } from "zod";

const router = Router();

const clientErrorSchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(10000).optional(),
  path: z.string().max(500).optional(),
});

// Unauthenticated on purpose: a frontend render crash can happen before login
// (e.g. on the login page itself), so this can't sit behind requireAuth.
// Log-only — nothing is persisted to the database.
router.post("/api/client-error", (req: Request, res: Response) => {
  const parsed = clientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid error report" });
  }
  console.error(
    JSON.stringify({
      requestId: req.id,
      errorType: "client",
      message: parsed.data.message,
      stack: parsed.data.stack,
      componentStack: parsed.data.componentStack,
      clientPath: parsed.data.path,
    })
  );
  res.status(204).end();
});

export default router;
