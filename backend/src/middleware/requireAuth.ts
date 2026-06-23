import { Request, Response, NextFunction } from "express";

/** Express middleware — returns 401 JSON if the request has no active session. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Authentication required. Please sign in." });
}
