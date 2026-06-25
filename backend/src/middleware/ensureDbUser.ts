import { Request, Response, NextFunction } from "express";
import { resolveDbUser } from "../db.js";
import type { DbUser } from "../db.js";

/**
 * Reconcile the session user with Supabase before protected API handlers run.
 * Prevents FK errors when an offline guest id was stored in the session.
 */
export function ensureDbUser(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.user as DbUser | undefined;
  if (!sessionUser?.id) return next();

  void resolveDbUser(sessionUser)
    .then((dbUser) => {
      if (dbUser.id !== sessionUser.id) {
        req.login(dbUser, (err) => {
          if (err) {
            console.warn("[auth] session refresh failed:", err.message);
          }
          next();
        });
        return;
      }
      next();
    })
    .catch((err) => {
      console.error("[auth] ensureDbUser failed:", err instanceof Error ? err.message : err);
      res.status(500).json({
        error: "Could not resolve your account in the database. Please sign out and sign in again.",
      });
    });
}
