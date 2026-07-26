import { Request, Response, NextFunction } from "express";
import { buildLocalDevGuest } from "../db.js";
import { GUEST_COOKIE_NAME, guestToken } from "../lib/guestToken.js";

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
 * Stateless safety net for the shared guest demo account. `mock-login` sets a
 * signed cookie independent of the Passport session store. If the DB-backed
 * session didn't authenticate this request — Supabase unreachable, a cold
 * serverless instance that missed the in-memory session fallback, etc. — but
 * this cookie is present and valid, treat the request as the guest anyway.
 */
export function guestSession(req: Request, _res: Response, next: NextFunction) {
  if (!req.user && readCookie(req, GUEST_COOKIE_NAME) === guestToken()) {
    req.user = buildLocalDevGuest();
  }
  next();
}
