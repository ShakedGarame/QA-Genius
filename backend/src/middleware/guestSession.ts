import { Request, Response, NextFunction } from "express";
import { buildPublicGuest } from "../db.js";
import { GUEST_COOKIE_NAME, verifyGuestCookie } from "../lib/guestToken.js";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

/**
 * Stateless safety net for public guest access. `mock-login` sets a signed
 * cookie carrying that specific browser's guest id, independent of the
 * Passport session store. If the DB-backed session didn't authenticate this
 * request — a cold serverless instance that missed the in-memory session
 * fallback, etc. — but this cookie is present and its signature checks out,
 * rebuild that same guest identity from it rather than falling back to any
 * shared identity.
 */
export function guestSession(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    const cookieValue = readCookie(req, GUEST_COOKIE_NAME);
    const guestId = cookieValue ? verifyGuestCookie(cookieValue) : null;
    if (guestId) {
      req.user = buildPublicGuest(guestId);
    }
  }
  next();
}
