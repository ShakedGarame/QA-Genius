import { Request, Response, NextFunction } from "express";
import { buildLocalDevGuest } from "../db.js";

const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

function localAutoLoginEnabled(): boolean {
  if (isProduction) return false;
  if (process.env.LOCAL_DEV_AUTO_LOGIN === "0") return false;
  return true;
}

/** On localhost, silently sign in as Guest Developer — no DB call, instant. */
export function autoLocalGuest(req: Request, _res: Response, next: NextFunction) {
  if (!localAutoLoginEnabled() || req.isAuthenticated()) {
    return next();
  }

  const guest = buildLocalDevGuest();
  req.login(guest, (err) => {
    if (err) console.warn("[auth] auto local guest failed:", err.message);
    next();
  });
}
