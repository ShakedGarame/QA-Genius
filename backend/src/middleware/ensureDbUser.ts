import { Request, Response, NextFunction } from "express";
import { resolveDbUser, buildLocalDevGuest } from "../db.js";
import type { DbUser } from "../db.js";

/**
 * Reconcile the session user with Supabase before protected API handlers run.
 * Prevents FK errors when an offline guest id was stored in the session.
 *
 * passport.session() already ran deserializeUser earlier in this same request,
 * which re-fetched the user from the DB (req.isAuthenticated()/requireAuth would
 * have already rejected the request if that lookup had failed) — except for the
 * local-dev offline guest, which deserializeUser intentionally returns without a
 * DB round-trip. So only that guest id actually needs reconciling here; every
 * other session user has already been freshly validated this request.
 */
export function ensureDbUser(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.user as DbUser | undefined;
  if (!sessionUser?.id) return next();
  if (sessionUser.id !== buildLocalDevGuest().id) return next();

  void resolveDbUser(sessionUser)
    .then((dbUser) => {
      if (res.headersSent) return;
      if (dbUser.id !== sessionUser.id) {
        req.login(dbUser, (err) => {
          if (res.headersSent) return;
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
      if (res.headersSent) return;
      res.status(500).json({
        error: "Could not resolve your account in the database. Please sign out and sign in again.",
      });
    });
}
