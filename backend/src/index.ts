import dotenv from "dotenv";
import path from "path";
import { execSync } from "node:child_process";
import type { Server } from "node:http";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend", ".env"),
]) {
  dotenv.config({ path: envPath });
}

import app from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
let server: Server | undefined;
let shuttingDown = false;

function freePort(port: number): void {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, {
      stdio: "ignore",
      shell: "/bin/bash",
    });
  } catch {
    // port already free
  }
}

function onListening() {
  const mode = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY ? "AI" : "MOCK";
  const githubAuth = process.env.GITHUB_CLIENT_ID ? "✓ GitHub" : "✗ GitHub (no keys)";
  const googleAuth = process.env.GOOGLE_CLIENT_ID ? "✓ Google" : "✗ Google (no keys)";
  const dbStatus = process.env.DATABASE_URL ? "✓ PostgreSQL (Supabase)" : "✗ DATABASE_URL missing";
  const autoLogin =
    process.env.LOCAL_DEV_AUTO_LOGIN === "0" ? "✗ disabled" : "✓ guest auto-login";

  console.log(`\n🚀 QA-Genius Backend running on http://localhost:${PORT}`);
  console.log(`⚡ Mode: ${mode}`);
  console.log(`🔐 Auth: ${githubAuth}  ${googleAuth}`);
  console.log(`👤 Local login: ${autoLogin}`);
  console.log(`💾 DB: ${dbStatus}\n`);
}

function startServer(attempt = 1): void {
  if (shuttingDown) return;

  server = app.listen(PORT, onListening);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (attempt >= 2) freePort(PORT);
      if (attempt < 12) {
        console.warn(`⚠ Port ${PORT} busy — retrying (${attempt}/11)…`);
        server?.close(() => {
          setTimeout(() => startServer(attempt + 1), 600);
        });
        return;
      }
    }
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });
}

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} — shutting down…`);
  server?.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}

if (!process.env.VERCEL) {
  startServer();
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGHUP", () => shutdown("SIGHUP"));
  process.on("uncaughtException", (err) => {
    console.error("[fatal] uncaughtException — server stays up:", err.message);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[fatal] unhandledRejection — server stays up:", reason);
  });
}

export default app;
