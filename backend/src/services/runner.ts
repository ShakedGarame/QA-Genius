import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { RunTestResult } from "../types/index.js";

const execFileAsync = promisify(execFile);

const GENERATED_TESTS_DIR = path.join(process.cwd(), "generated-tests");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Writes the generated Playwright code to disk and attempts to run it.
 * In mock mode (no `npx playwright` available) returns a realistic simulated output.
 */
export async function runTest(code: string, testId?: string): Promise<RunTestResult> {
  const id = testId ?? uuidv4();
  ensureDir(GENERATED_TESTS_DIR);

  const testFile = path.join(GENERATED_TESTS_DIR, `${id}.spec.ts`);
  fs.writeFileSync(testFile, code, "utf-8");

  const start = Date.now();

  // Check if playwright is available in the project
  let playwrightAvailable = false;
  try {
    await execFileAsync("npx", ["playwright", "--version"], { timeout: 5000 });
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }

  if (!playwrightAvailable) {
    return mockRunResult(id, code, Date.now() - start);
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "npx",
      ["playwright", "test", testFile, "--reporter=line"],
      {
        timeout: 60000,
        env: { ...process.env, CI: "true" },
      }
    );

    const output = (stdout + stderr).trim();
    const passed = /\d+ passed/.test(output) && !/\d+ failed/.test(output);

    return {
      testId: id,
      status: passed ? "passed" : "failed",
      output,
      duration: Date.now() - start,
      errorDetails: passed ? undefined : extractError(output),
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = (((error.stdout ?? "") + (error.stderr ?? "")).trim()) || (error.message ?? "Unknown error");
    return {
      testId: id,
      status: "failed",
      output,
      duration: Date.now() - start,
      errorDetails: extractError(output),
    };
  }
}

function extractError(output: string): string {
  const lines = output.split("\n");
  const errorLines = lines.filter(
    (l) => /error|failed|expect|timeout/i.test(l) && l.trim()
  );
  return errorLines.slice(0, 8).join("\n") || output.slice(0, 400);
}

function mockRunResult(id: string, code: string, elapsed: number): RunTestResult {
  const hasMockComment = code.includes("MOCK MODE");
  // Randomly pass ~40% of the time so demos can show both states
  const shouldPass = Math.random() < 0.4;

  const passOutput = `
Running 2 tests using 1 worker
  ✓  TC-001: renders without errors (1.2s)
  ✓  TC-002: meets acceptance criteria (0.8s)

  2 passed (3.1s)
`.trim();

  const failOutput = `
Running 2 tests using 1 worker
  ✓  TC-001: renders without errors (1.1s)
  ✗  TC-002: meets acceptance criteria (5.0s)

  1) TC-002: meets acceptance criteria ──────────────────────────────────────

    Error: Timed out 5000ms waiting for expect(locator).toBeVisible()

    Call log:
      - expect.toBeVisible with timeout 5000ms
      - waiting for getByText(/success|completed|done/i)

    at ${code.includes("Page") ? "FeaturePage" : "test"} (generated-tests/${id}.spec.ts:47:12)

  1 failed (6.2s)
`.trim();

  return {
    testId: id,
    status: shouldPass ? "passed" : "failed",
    output: shouldPass ? passOutput : failOutput,
    duration: elapsed + (shouldPass ? 3100 : 6200),
    errorDetails: shouldPass
      ? undefined
      : `Error: Timed out 5000ms waiting for expect(locator).toBeVisible()\n\nThe element matching getByText(/success|completed|done/i) was not found within the timeout window.${hasMockComment ? "\n\n⚠️  Running in MOCK MODE — add OPENAI_API_KEY + install Playwright for real execution." : ""}`,
  };
}
