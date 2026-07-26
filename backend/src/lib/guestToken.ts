import crypto from "crypto";

/**
 * Stateless proof of guest access, independent of the Postgres-backed session
 * store. The shared guest demo account has no real per-user data to protect,
 * so a fixed HMAC token (rather than a per-session secret) is enough to let
 * `guestSession` middleware recognize a returning guest even when Supabase —
 * and therefore both `deserializeUser` and the session store — is down.
 */

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";

export const GUEST_COOKIE_NAME = "qagenius.guest";

export function guestToken(): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update("guest-developer").digest("hex");
}
