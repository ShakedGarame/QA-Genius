import { Request, Response, NextFunction } from "express";
import { getOrCreateGuestUser } from "../db.js";

const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

function localAutoLoginEnabled(): boolean {
  if (isProduction) return false;
  if (process.env.LOCAL_DEV_AUTO_LOGIN === "0") return false;
  return true;
}

/** On localhost, silently sign in as Guest Developer — no login screen needed. */
export function autoLocalGuest(req: Request, res: Response, next: NextFunction) {
  if (!localAutoLoginEnabled() || req.isAuthenticated()) {
    return next();
  }

  void getOrCreateGuestUser()
    .then((guest) => {
      req.login(guest, (err) => {
        if (err) {
          console.warn("[auth] auto local guest failed:", err.message);
          return next();
        }
        next();
      });
    })
    .catch((err) => {
      console.warn("[auth] auto local guest error:", err instanceof Error ? err.message : err);
      next();
    });
}
