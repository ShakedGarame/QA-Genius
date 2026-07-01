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

import uploadRouter from "./routes/upload.js";
import generateRouter from "./routes/generate.js";
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

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

if (isProduction) {
  app.set("trust proxy", 1);
}

// ─── Session store ────────────────────────────────────────────────────────────
// Local dev: in-memory sessions (no Supabase dependency, survives db push).
// Production: PostgreSQL via connect-pg-simple.

function createSessionStore(): session.Store | undefined {
  if (!isProduction) {
    console.log("[session] Using in-memory store for local development");
    return undefined; // express-session default MemoryStore
  }

  const PgSession = connectPgSimple(session);
  // DATABASE_URL is the transaction pooler (high concurrency budget) — DIRECT_URL
  // is the session pooler, reserved for migrations and capped at 15 clients.
  // Session lookups happen on every request, so they must not compete for that cap.
  const sessionConnectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  const pool = new pg.Pool({
    connectionString: sessionConnectionString,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });

  return new PgSession({
    pool,
    createTableIfMissing: true,
    tableName: "session",
  });
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
app.use("/api", requireAuth, ensureDbUser, uploadRouter);
app.use("/api", requireAuth, ensureDbUser, generateRouter);
app.use("/api", requireAuth, ensureDbUser, runRouter);
app.use("/api", requireAuth, ensureDbUser, analyzeRouter);
app.use("/api", requireAuth, ensureDbUser, testsRouter);
app.use("/api", requireAuth, ensureDbUser, logAnalysesRouter);
app.use("/api", requireAuth, ensureDbUser, testRunsRouter);
app.use("/api", requireAuth, ensureDbUser, issuesRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err.message);
  res.status(500).json({ error: err.message ?? "Internal server error" });
});

export default app;
