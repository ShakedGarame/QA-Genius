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
import authRouter from "./routes/auth.js";
import { requireAuth } from "./middleware/requireAuth.js";

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

// ─── Session store (PostgreSQL — works on Vercel) ─────────────────────────────

const PgSession = connectPgSimple(session);
// Sessions need session-mode pooler (5432); Prisma uses transaction pooler (6543) via DATABASE_URL.
const sessionConnectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString: sessionConnectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

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
    store: new PgSession({
      pool,
      createTableIfMissing: true,
      tableName: "session",
    }),
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
app.use("/api", requireAuth, uploadRouter);
app.use("/api", requireAuth, generateRouter);
app.use("/api", requireAuth, runRouter);
app.use("/api", requireAuth, analyzeRouter);
app.use("/api", requireAuth, testsRouter);
app.use("/api", requireAuth, logAnalysesRouter);

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
