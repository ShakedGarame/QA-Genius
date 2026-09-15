import crypto from "crypto";

/**
 * Stateless safety net for public guest access, independent of the
 * Postgres-backed session store: `mock-login` mints a per-browser guest id
 * and signs it into this cookie, so `guestSession` middleware can still
 * recognize that *specific* returning guest even when Supabase — and
 * therefore both `deserializeUser` and the session store — is unreachable.
 *
 * Signed (not just stored), and verified with a constant-time comparison, so
 * a visitor can't forge an arbitrary guest id via the cookie.
 */

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";

export const GUEST_COOKIE_NAME = "qagenius.guest";

function sign(guestId: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(guestId).digest("hex");
}

export function signGuestCookie(guestId: string): string {
  return `${guestId}.${sign(guestId)}`;
}

/** Returns the guest id if the cookie's signature is valid, otherwise null. */
export function verifyGuestCookie(cookieValue: string): string | null {
  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex === -1) return null;

  const guestId = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  const expected = sign(guestId);

  const signatureBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (signatureBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(signatureBuf, expectedBuf)) return null;

  return guestId;
}
