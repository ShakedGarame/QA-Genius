#!/usr/bin/env node
/**
 * Clean dev startup — frees ports 3001/5173 before launching backend + frontend.
 * Prevents EADDRINUSE crash loops when tsx watch restarts or stale processes linger.
 */
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function killPort(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "ignore", shell: true });
  } catch {
    // port already free
  }
}

console.log("🧹 Clearing dev ports 3001 and 5173…");
killPort(3001);
killPort(5173);

const child = spawn(
  'npx concurrently -n backend,frontend -c cyan,magenta "npm run dev --workspace=backend" "npm run dev --workspace=frontend"',
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, LOCAL_DEV_AUTO_LOGIN: "1" },
  }
);

child.on("exit", (code) => process.exit(code ?? 0));

process.on("SIGINT", () => {
  child.kill("SIGINT");
});
process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
