/**
 * Wraps a Postgres-backed session store (connect-pg-simple) and falls back to
 * an in-memory store whenever the underlying database call fails.
 *
 * Why this exists: Supabase can become unreachable (project paused, pooler
 * tenant reassigned, transient network blip — see the "Tenant or user not
 * found" Supavisor error). Every login goes through Passport's
 * `req.session.regenerate()` + `req.session.save()`, both of which hit this
 * store. Without a fallback, a single unreachable-DB moment turns into a
 * thrown store error that Express re-surfaces as a fatal response — even
 * though the rest of the app (e.g. `getOrCreateGuestUser`) already knows how
 * to degrade gracefully when Supabase is down.
 *
 * The in-memory fallback is per-instance and non-persistent: on Vercel's
 * Fluid Compute, that means a session created during an outage only survives
 * as long as the same warm instance keeps handling that visitor's requests.
 * That's a strictly better failure mode than a 500 — worst case the guest is
 * asked to sign in again — and it self-heals automatically the moment
 * Postgres calls start succeeding again, no restart required.
 */
import session, { SessionData } from "express-session";

export class ResilientSessionStore extends session.Store {
  private readonly memory = new session.MemoryStore();

  constructor(private readonly primary: session.Store) {
    super();
  }

  private onFallback(op: string, err: unknown): void {
    console.warn(
      `[session] Postgres store ${op}() failed — falling back to in-memory session for this request:`,
      err instanceof Error ? err.message : err
    );
  }

  get(sid: string, cb: (err: unknown, session?: SessionData | null) => void): void {
    this.primary.get(sid, (err, sess) => {
      if (err) {
        this.onFallback("get", err);
        this.memory.get(sid, cb);
        return;
      }
      cb(null, sess);
    });
  }

  set(sid: string, sessionData: SessionData, cb?: (err?: unknown) => void): void {
    this.primary.set(sid, sessionData, (err) => {
      if (err) {
        this.onFallback("set", err);
        this.memory.set(sid, sessionData, cb);
        return;
      }
      cb?.();
    });
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.primary.destroy(sid, (err) => {
      if (err) {
        this.onFallback("destroy", err);
        this.memory.destroy(sid, cb);
        return;
      }
      cb?.();
    });
  }

  touch(sid: string, sessionData: SessionData, cb?: () => void): void {
    if (typeof this.primary.touch !== "function") {
      cb?.();
      return;
    }
    // connect-pg-simple's touch() takes no err param on success, but can
    // still throw/reject internally on a dead connection — guard it the same
    // way as get/set/destroy rather than assuming it always succeeds.
    try {
      this.primary.touch(sid, sessionData, () => cb?.());
    } catch (err) {
      this.onFallback("touch", err);
      if (typeof this.memory.touch === "function") {
        this.memory.touch(sid, sessionData, cb);
      } else {
        cb?.();
      }
    }
  }
}
