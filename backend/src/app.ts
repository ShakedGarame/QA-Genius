import dotenv from "dotenv";
import path from "path";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend", ".env"),
]) {
  dotenv.config({ path: envPath });
}

import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";

import passport from "./passportConfig.js";
import { ResilientSessionStore } from "./lib/resilientSessionStore.js";

import uploadRouter from "./routes/upload.js";
import generateRouter from "./routes/generate.js";
import generateStdRouter from "./routes/generateStd.js";
import runRouter from "./routes/run.js";
import analyzeRouter from "./routes/analyze.js";
import testsRouter from "./routes/tests.js";
import logAnalysesRouter from "./routes/logAnalyses.js";
import testRunsRouter from "./routes/testRuns.js";
import issuesRouter from "./routes/issues.js";
import authRouter from "./routes/auth.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { ensureDbUser } from "./middleware/ensureDbUser.js";
import { autoLocalGuest } from "./middleware/autoLocalGuest.js";
import { guestSession } from "./middleware/guestSession.js";

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

if (isProduction) {
  app.set("trust proxy", 1);
}

// ─── Session store ────────────────────────────────────────────────────────────
// Local dev: in-memory sessions (no Supabase dependency, survives db push).
// Production: PostgreSQL via connect-pg-simple.

const globalForSessionPool = globalThis as unknown as { sessionPool?: pg.Pool };

/** Single shared pool for the session store, created once per process and
 * reused (same globalThis-caching pattern as prisma.ts) rather than a fresh
 * pool being instantiated on every module load. */
function getSessionPool(): pg.Pool {
  if (globalForSessionPool.sessionPool) return globalForSessionPool.sessionPool;
  const pool = new pg.Pool({
    // DATABASE_URL is preferred over DIRECT_URL (see commit f99111e) to keep
    // session lookups off the lower-concurrency connection string.
    connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });
  // pg.Pool emits 'error' for background/idle-client faults (e.g. Supabase
  // pooler dropping a connection). With no listener, Node treats that as an
  // uncaught exception and can take down the whole warm instance — not just
  // the request that triggered it.
  pool.on("error", (err) => {
    console.error("[session] Postgres pool error (connection recovered automatically):", err.message);
  });
  globalForSessionPool.sessionPool = pool;
  return pool;
}

function createSessionStore(): session.Store | undefined {
  if (!isProduction) {
    console.log("[session] Using in-memory store for local development");
    return undefined; // express-session default MemoryStore
  }

  const PgSession = connectPgSimple(session);

  const pgStore = new PgSession({
    pool: getSessionPool(),
    // The "session" table and its indexes already exist (verified directly
    // against Postgres) — createTableIfMissing was making every cold start pay
    // for a to_regclass existence check before the first session query.
    createTableIfMissing: false,
    tableName: "session",
  });

  // Every login goes through Passport's session.regenerate()/save(), both of
  // which hit this store. If Supabase is temporarily unreachable, fall back
  // to an in-memory session instead of failing the request — see
  // ResilientSessionStore for details.
  return new ResilientSessionStore(pgStore);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "qagenius.sid",
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(autoLocalGuest);
app.use(guestSession);

// ─── Auth routes (public) ─────────────────────────────────────────────────────
app.use(authRouter);

// ─── Health check (public) ────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasCoralogix = !!process.env.CORALOGIX_API_KEY;
  const githubReady = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  const googleReady = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasDatabase = !!process.env.DATABASE_URL;

  res.json({
    status: "ok",
    mode: hasOpenAI || hasAnthropic ? "ai" : "mock",
    database: hasDatabase ? "configured" : "missing",
    deployment: process.env.VERCEL === "1" ? "vercel" : "local",
    ai: {
      openai: hasOpenAI ? "configured" : "mock",
      anthropic: hasAnthropic ? "configured" : "mock",
    },
    observability: {
      coralogix: hasCoralogix ? "configured" : "simulated",
    },
    auth: {
      github: githubReady ? "configured" : "disabled",
      google: googleReady ? "configured" : "disabled",
    },
  });
});

// ─── Protected API routes ─────────────────────────────────────────────────────
// Mounted once behind a single requireAuth + ensureDbUser pair — previously each
// router had its own copy, so a request handled by the last-mounted router (e.g.
// issuesRouter) paid the cost of both middlewares up to 8 times as it fell through
// every preceding non-matching router.
const protectedRouter = express.Router();
protectedRouter.use(uploadRouter);
protectedRouter.use(generateRouter);
protectedRouter.use(generateStdRouter);
protectedRouter.use(runRouter);
protectedRouter.use(analyzeRouter);
protectedRouter.use(testsRouter);
protectedRouter.use(logAnalysesRouter);
protectedRouter.use(testRunsRouter);
protectedRouter.use(issuesRouter);
app.use("/api", requireAuth, ensureDbUser, protectedRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[error]", err.message);
  // Express requires this check: an error can surface here after a response
  // has already started (e.g. a deferred session-store save failing after
  // res.end() was already called). Calling res.json() again in that case
  // throws ERR_HTTP_HEADERS_SENT, which crashes the whole request instead of
  // just logging a background failure. Delegating to the default handler is
  // the documented way to let Node close the connection safely.
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: err.message ?? "Internal server error" });
});

export default app;
