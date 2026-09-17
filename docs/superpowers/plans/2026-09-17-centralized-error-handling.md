# Centralized Error Handling & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the backend from leaking raw Prisma/SDK/internal error messages to API clients, add structured per-request logging, and add a React error boundary so a frontend render crash shows a recoverable screen instead of a white page.

**Architecture:** A shared `normalizeError`/`sendError` helper in `backend/src/lib/errors.ts` maps known error types (Prisma, Zod, LLM SDK, app-level `AppError`) to a safe client message + status, and logs the full detail server-side keyed by a per-request UUID (`req.id`, set by new `requestId` middleware). Every existing route `catch` block is refactored to call this helper instead of its own inline `err instanceof Error ? err.message : "..."` logic. A new unauthenticated `POST /api/client-error` route lets the frontend's new `ErrorBoundary` component report render crashes into the same structured log stream.

**Tech Stack:** Express 4, TypeScript (strict, CommonJS module output, `.js`-suffixed relative imports), Prisma 6, `zod` (new dependency, `^4.6.5`), React 18 class component for the error boundary.

**Spec:** `docs/superpowers/specs/2026-09-17-centralized-error-handling-design.md`

---

## Context for the implementer

- Read `backend/src/app.ts` fully before starting — it shows the existing session/middleware/router wiring you'll be extending, including the existing (currently too-generic) global error handler at the bottom.
- All backend imports use the `.js` extension on relative paths even though the files are `.ts` (e.g. `import type { DbUser } from "../db.js";`) — this is deliberate, follow it. `tsconfig.json` has `"module": "commonjs"`.
- There is no test framework in this repo (no jest/vitest, no `.test.ts` files, no `test` script in `backend/package.json`). Verification throughout this plan is manual: `npm run build` (typecheck), running the dev servers, and curl/browser checks. Don't add a test framework — out of scope.
- `req.user` is cast inline as `DbUser` (from `backend/src/db.ts`) everywhere in the existing routes, e.g. `(req.user as DbUser).id` — there's no global Passport type augmentation. Follow the same inline-cast pattern where you need the user id for logging.
- Dev servers: `npm run dev` from the repo root starts both backend (port 3001) and frontend (Vite) via `scripts/dev.mjs`. Backend alone: `cd backend && npm run dev`. Frontend alone: `cd frontend && npm run dev`.

---

### Task 1: Add `zod` dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install the dependency**

Run: `cd backend && npm install zod@^4.6.5`

Expected: `package.json`'s `dependencies` gains a `"zod": "^4.6.5"` entry and `package-lock.json` updates. No other dependency versions should change.

- [ ] **Step 2: Verify it resolves**

Run: `cd backend && node -e "const { z } = require('zod'); console.log(typeof z.object)"`

Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add zod dependency for request/error validation"
```

---

### Task 2: Request ID middleware

**Files:**
- Create: `backend/src/middleware/requestId.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create the middleware**

```ts
// backend/src/middleware/requestId.ts
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
  interface Request {
    id: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
```

- [ ] **Step 2: Mount it first in the middleware chain**

In `backend/src/app.ts`, add the import near the other middleware imports:

```ts
import { requestId } from "./middleware/requestId.js";
```

Then mount it as the very first `app.use(...)` call — before `app.use(cors(...))`:

```ts
const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(requestId);
```

(The `app.use(requestId);` line goes right after the existing `if (isProduction) { app.set("trust proxy", 1); }` block and before the `// ─── Session store` comment section — i.e. before `app.use(cors(...))` further down.)

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors mentioning `req.id` or `requestId`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/requestId.ts backend/src/app.ts
git commit -m "feat: add per-request UUID middleware for error correlation"
```

---

### Task 3: Error normalization library

**Files:**
- Create: `backend/src/lib/errors.ts`

- [ ] **Step 1: Write the library**

```ts
// backend/src/lib/errors.ts
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { Request, Response } from "express";
import type { DbUser } from "../db.js";

/** Thrown intentionally by route logic when the message is already safe to show the client. */
export class AppError extends Error {
  statusCode: number;
  safeMessage: string;

  constructor(statusCode: number, safeMessage: string) {
    super(safeMessage);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.safeMessage = safeMessage;
  }
}

interface NormalizedError {
  status: number;
  safeMessage: string;
  errorType: string;
}

function isSdkErrorShape(err: unknown): err is { status?: number; code?: string } {
  return typeof err === "object" && err !== null && ("status" in err || "code" in err);
}

/** Maps any thrown value to a status code + client-safe message. Never returns the raw
 * internal error message for Prisma/unknown errors — only AppError and Zod messages
 * (already user-facing) pass through as-is. */
export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof AppError) {
    return { status: err.statusCode, safeMessage: err.safeMessage, errorType: "AppError" };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      safeMessage: err.issues.map((issue) => issue.message).join(", "),
      errorType: "ZodError",
    };
  }
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientValidationError
  ) {
    return { status: 500, safeMessage: "Database error, please try again", errorType: "PrismaError" };
  }
  if (isSdkErrorShape(err) && typeof err.status === "number") {
    const isRateLimited = err.status === 429;
    return {
      status: isRateLimited ? 429 : 502,
      safeMessage: "AI service temporarily unavailable, please try again",
      errorType: "LlmSdkError",
    };
  }
  return { status: 500, safeMessage: "Internal server error", errorType: "UnknownError" };
}

/** Writes one structured JSON log line with the full (server-side-only) error detail,
 * keyed by the request's correlation id. */
export function logError(req: Request, err: unknown, errorType?: string): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const userId = (req.user as DbUser | undefined)?.id;
  console.error(
    JSON.stringify({
      requestId: req.id,
      method: req.method,
      path: req.path,
      userId,
      errorType: errorType ?? normalizeError(err).errorType,
      message,
      stack,
    })
  );
}

/** Logs the full error and sends the client a safe JSON error response.
 * Pass `overrides` to keep an existing route's specific status/message (e.g. a 422 for
 * a bad file upload) while still gaining structured logging + a requestId in the response. */
export function sendError(
  res: Response,
  req: Request,
  err: unknown,
  overrides?: { status?: number; safeMessage?: string; errorType?: string }
): void {
  const normalized = normalizeError(err);
  const status = overrides?.status ?? normalized.status;
  const safeMessage = overrides?.safeMessage ?? normalized.safeMessage;
  logError(req, err, overrides?.errorType ?? normalized.errorType);
  res.status(status).json({ error: safeMessage, requestId: req.id });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification of the mapping logic**

Create a scratch file (not committed) to sanity-check `normalizeError` against real error shapes:

```ts
// /tmp/verify-normalize.ts (or your scratchpad dir — do not put this under backend/src)
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { AppError, normalizeError } from "/ABSOLUTE/PATH/TO/backend/src/lib/errors";

console.log(normalizeError(new AppError(404, "Feature not found")));
// expect: { status: 404, safeMessage: "Feature not found", errorType: "AppError" }

const zodResult = z.object({ name: z.string() }).safeParse({});
console.log(normalizeError(zodResult.success ? undefined : zodResult.error));
// expect: { status: 400, safeMessage: "<some validation message>", errorType: "ZodError" }

console.log(
  normalizeError(
    new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "6.19.0" })
  )
);
// expect: { status: 500, safeMessage: "Database error, please try again", errorType: "PrismaError" }

console.log(normalizeError(new Error("some internal detail")));
// expect: { status: 500, safeMessage: "Internal server error", errorType: "UnknownError" }
```

Run: `cd backend && npx tsx /tmp/verify-normalize.ts` (adjust the import path to wherever you saved the scratch file)
Expected: the four console.log lines match the comments above. Delete the scratch file afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/errors.ts
git commit -m "feat: add normalizeError/logError/sendError error-handling library"
```

---

### Task 4: Wire the global error handler to use the new library

**Files:**
- Modify: `backend/src/app.ts:182-195`

- [ ] **Step 1: Import the library**

Add near the other imports in `app.ts`:

```ts
import { normalizeError, logError } from "./lib/errors.js";
```

- [ ] **Step 2: Replace the global handler body**

Find:

```ts
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
```

Replace with:

```ts
// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Express requires this check: an error can surface here after a response
  // has already started (e.g. a deferred session-store save failing after
  // res.end() was already called). Calling res.json() again in that case
  // throws ERR_HTTP_HEADERS_SENT, which crashes the whole request instead of
  // just logging a background failure. Delegating to the default handler is
  // the documented way to let Node close the connection safely.
  if (res.headersSent) {
    logError(req, err);
    return next(err);
  }
  const { status, safeMessage } = normalizeError(err);
  logError(req, err);
  res.status(status).json({ error: safeMessage, requestId: req.id });
});
```

(Note `_req` becomes `req` since it's now used.)

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.ts
git commit -m "refactor: route global error handler through normalizeError/logError"
```

---

### Task 5: Client-error reporting endpoint

**Files:**
- Create: `backend/src/routes/errors.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write the route**

```ts
// backend/src/routes/errors.ts
import { Router, type Request, type Response } from "express";
import { z } from "zod";

const router = Router();

const clientErrorSchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(10000).optional(),
  path: z.string().max(500).optional(),
});

// Unauthenticated on purpose: a frontend render crash can happen before login
// (e.g. on the login page itself), so this can't sit behind requireAuth.
// Log-only — nothing is persisted to the database.
router.post("/api/client-error", (req: Request, res: Response) => {
  const parsed = clientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid error report" });
  }
  console.error(
    JSON.stringify({
      requestId: req.id,
      errorType: "client",
      message: parsed.data.message,
      stack: parsed.data.stack,
      componentStack: parsed.data.componentStack,
      clientPath: parsed.data.path,
    })
  );
  res.status(204).end();
});

export default router;
```

*(This deliberately logs directly with `console.error` in the same JSON shape as `logError` rather than calling `logError()` itself — `logError` is built around a real thrown `Error`/`req.id`/`req.user`, whereas this route already has pre-serialized client data with its own `stack`/`componentStack` fields.)*

- [ ] **Step 2: Mount it publicly, same as `authRouter`**

In `backend/src/app.ts`, add the import:

```ts
import errorsRouter from "./routes/errors.js";
```

Mount it right next to the existing `app.use(authRouter);` line (before the `/health` route), **not** inside `protectedRouter`:

```ts
// ─── Auth routes (public) ─────────────────────────────────────────────────────
app.use(authRouter);
app.use(errorsRouter);
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the backend: `cd backend && npm run dev` (leave running)

In another terminal:

```bash
curl -i -X POST http://localhost:3001/api/client-error \
  -H "Content-Type: application/json" \
  -d '{"message":"test crash","stack":"Error: test crash\n at x","path":"/settings"}'
```

Expected: `HTTP/1.1 204 No Content`, and the backend terminal prints a JSON line containing `"errorType":"client"` and `"message":"test crash"`.

```bash
curl -i -X POST http://localhost:3001/api/client-error \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `HTTP/1.1 400`, body `{"error":"Invalid error report"}`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/errors.ts backend/src/app.ts
git commit -m "feat: add POST /api/client-error for frontend crash reporting"
```

---

### Task 6: Refactor `analyze.ts`

**Files:**
- Modify: `backend/src/routes/analyze.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError, logError } from "../lib/errors.js";
```

- [ ] **Step 2: Leave the non-fatal Coralogix fallback catch (line ~73) as-is, but add structured logging**

This catch doesn't send an error response — it logs and falls back to simulated logs, and the caught message is shown to the user as a normal (non-error) progress event, which is intentional UX (transparency about why it fell back), not a leak of internal/DB details. Only add observability; don't change its behavior.

Find:

```ts
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Coralogix fetch failed";
        sendEvent("mcp_step", {
```

Replace with:

```ts
      } catch (err) {
        logError(req, err, "coralogix_fetch_fallback");
        const msg = err instanceof Error ? err.message : "Coralogix fetch failed";
        sendEvent("mcp_step", {
```

- [ ] **Step 3: Fix the two terminal SSE error catches**

These use a per-handler closure named `sendEvent` that captures `res` internally (no `res` argument) — do not confuse this with `run.ts`'s differently-named, differently-signatured `sendSSE` helper (Task 7).

Find (appears twice, at the two locations around line 131 and 207 — apply to both):

```ts
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analysis error";
    sendEvent("error", { message });
  } finally {
    res.end();
```

Replace with:

```ts
  } catch (err: unknown) {
    const { safeMessage } = normalizeError(err);
    logError(req, err);
    sendEvent("error", { message: safeMessage, requestId: req.id });
  } finally {
    res.end();
```

You'll need to also import `normalizeError`:

```ts
import { sendError, logError, normalizeError } from "../lib/errors.js";
```

(`sendError` itself isn't used in this file since both real error sites are SSE, not JSON responses — remove it from the import if your linter/tsc flags it as unused, or keep only `logError, normalizeError`.)

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (watch for an "unused import" `sendError` — remove it if so).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/analyze.ts
git commit -m "refactor: route analyze.ts errors through normalizeError/logError"
```

---

### Task 7: Refactor `run.ts`

**Files:**
- Modify: `backend/src/routes/run.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError, logError, normalizeError } from "../lib/errors.js";
```

- [ ] **Step 2: Fix the two SSE error sites**

`run.ts` has its own module-level `sendSSE(res, event, data)` helper (`res` passed explicitly) — different from `analyze.ts`'s closures.

Find (around line 139-142):

```ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to trigger GitHub Actions";
    sendSSE(res, "error", { message });
    res.end();
```

Replace with:

```ts
  } catch (err) {
    const { safeMessage } = normalizeError(err);
    logError(req, err);
    sendSSE(res, "error", { message: safeMessage, requestId: req.id });
    res.end();
```

Find (around line 450-453):

```ts
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Execution error";
    sendSSE(res, "error", { message });
    res.end();
```

Replace with:

```ts
  } catch (err: unknown) {
    const { safeMessage } = normalizeError(err);
    logError(req, err);
    sendSSE(res, "error", { message: safeMessage, requestId: req.id });
    res.end();
```

- [ ] **Step 3: Fix the four JSON error sites**

Find (around line 217-220):

```ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to find dispatch run";
    return res.status(500).json({ error: message });
  }
```

Replace with:

```ts
  } catch (err) {
    sendError(res, req, err, { safeMessage: "Failed to find dispatch run" });
    return;
  }
```

Find (around line 241-245, keep the existing `console.error` call site's intent but let `logError` inside `sendError` cover it — remove the now-redundant manual `console.error`):

```ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch artifacts";
    console.error(`[artifacts] Run ${runId} failed:`, message);
    return res.status(500).json({ error: message });
```

Replace with:

```ts
  } catch (err) {
    sendError(res, req, err, { safeMessage: "Failed to fetch artifacts" });
    return;
```

Find (around line 267-270):

```ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch cloud status";
    return res.status(500).json({ error: message });
  }
```

Replace with:

```ts
  } catch (err) {
    sendError(res, req, err, { safeMessage: "Failed to fetch cloud status" });
    return;
  }
```

Find (around line 296-299):

```ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch cloud logs";
    return res.status(500).json({ error: message });
  }
```

Replace with:

```ts
  } catch (err) {
    sendError(res, req, err, { safeMessage: "Failed to fetch cloud logs" });
    return;
  }
```

*(These four keep their original fallback wording via `overrides.safeMessage`, but now also get structured logging + a `requestId` in the response body, and no longer leak the raw underlying message when the caught error isn't a plain `Error` with that intended fallback text — e.g. a GitHub API error object.)*

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/run.ts
git commit -m "refactor: route run.ts errors through normalizeError/logError/sendError"
```

---

### Task 8: Refactor `generateStd.ts`

**Files:**
- Modify: `backend/src/routes/generateStd.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError } from "../lib/errors.js";
```

- [ ] **Step 2: Replace all four catch blocks**

Find (around line 114-117):

```ts
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "STD generation failed";
      console.error("[generate-std]", message);
      return res.status(500).json({ error: message });
```

Replace with:

```ts
    } catch (err: unknown) {
      sendError(res, req, err, { safeMessage: "STD generation failed" });
      return;
```

Find (around line 127-129):

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list STDs" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to list STDs" });
  }
```

Find (around line 139-141):

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load STD" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to load STD" });
  }
```

Find (around line 151-153):

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete STD" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to delete STD" });
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/generateStd.ts
git commit -m "refactor: route generateStd.ts errors through sendError"
```

---

### Task 9: Refactor `tests.ts`

**Files:**
- Modify: `backend/src/routes/tests.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError } from "../lib/errors.js";
```

- [ ] **Step 2: Replace all six catch blocks**

Find:

```ts
  } catch (err: unknown) {
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Self-heal failed" });
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Self-heal failed" });
    return;
```

Find:

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list tests" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to list tests" });
  }
```

Find:

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load test" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to load test" });
  }
```

Find (the update handler):

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Update failed" });
  }
```

Find (both `Delete failed` sites — one for the file-delete route, one for the feature-delete route; apply to both, they're identical):

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Delete failed" });
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/tests.ts
git commit -m "refactor: route tests.ts errors through sendError"
```

---

### Task 10: Refactor `testRuns.ts`

**Files:**
- Modify: `backend/src/routes/testRuns.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError } from "../lib/errors.js";
```

- [ ] **Step 2: Replace all four catch blocks**

Find:

```ts
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list test runs" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to list test runs" });
  }
```

Find:

```ts
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load dashboard stats" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to load dashboard stats" });
  }
```

Find:

```ts
  } catch (err: unknown) {
    console.error("[test-runs]", err);
    res.status(500).json({ error: "Failed to create test run. Please try again." });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to create test run. Please try again." });
  }
```

Find:

```ts
  } catch (err: unknown) {
    console.error("[test-runs]", err);
    res.status(500).json({ error: "Failed to update test run. Please try again." });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to update test run. Please try again." });
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/testRuns.ts
git commit -m "refactor: route testRuns.ts errors through sendError"
```

---

### Task 11: Refactor `logAnalyses.ts`

**Files:**
- Modify: `backend/src/routes/logAnalyses.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError } from "../lib/errors.js";
```

- [ ] **Step 2: Replace all three catch blocks**

Find:

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list analyses" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to list analyses" });
  }
```

Find:

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load analysis" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to load analysis" });
  }
```

Find:

```ts
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete analysis" });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to delete analysis" });
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/logAnalyses.ts
git commit -m "refactor: route logAnalyses.ts errors through sendError"
```

---

### Task 12: Refactor `issues.ts`

**Files:**
- Modify: `backend/src/routes/issues.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError } from "../lib/errors.js";
```

- [ ] **Step 2: Replace both catch blocks**

These already use a safe generic message — keep the exact wording via `overrides.safeMessage`, just gain structured logging + requestId.

Find:

```ts
  } catch (err: unknown) {
    console.error("[issues/github/create]", err);
    return res.status(500).json({ error: "Failed to create GitHub issue. Please try again." });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to create GitHub issue. Please try again." });
  }
```

Find:

```ts
  } catch (err: unknown) {
    console.error("[issues/jira/create]", err);
    return res.status(500).json({ error: "Failed to create Jira ticket. Please try again." });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to create Jira ticket. Please try again." });
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/issues.ts
git commit -m "refactor: route issues.ts errors through sendError"
```

---

### Task 13: Refactor `upload.ts`

**Files:**
- Modify: `backend/src/routes/upload.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError } from "../lib/errors.js";
```

- [ ] **Step 2: Replace the catch block, preserving its 422 status**

This route intentionally returns 422 (client-side "couldn't parse your file") rather than 500 — keep that via `overrides.status`.

Find:

```ts
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to parse file";
    return res.status(422).json({ error: message });
  }
```

Replace with:

```ts
  } catch (err: unknown) {
    sendError(res, req, err, { status: 422, safeMessage: "Failed to parse file" });
    return;
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/upload.ts
git commit -m "refactor: route upload.ts errors through sendError, preserving 422 status"
```

---

### Task 14: Refactor `generate.ts`

**Files:**
- Modify: `backend/src/routes/generate.ts`

- [ ] **Step 1: Add the import**

```ts
import { sendError } from "../lib/errors.js";
```

- [ ] **Step 2: Replace the catch block**

Find:

```ts
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error("[generate-tests]", message);
      return res.status(500).json({ error: message });
    }
```

Replace with:

```ts
    } catch (err: unknown) {
      sendError(res, req, err, { safeMessage: "Generation failed" });
      return;
    }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/generate.ts
git commit -m "refactor: route generate.ts errors through sendError"
```

---

### Task 15: Backend full build check

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `cd backend && npm run build`
Expected: succeeds with no TypeScript errors (this runs `prisma generate && tsc`, exercising every file touched above at once).

- [ ] **Step 2: Confirm no leftover raw-message patterns**

Run: `cd backend && grep -rn "err instanceof Error ? err.message" src/routes/`
Expected: no output (empty) — every route-level catch has been migrated to `sendError`/`normalizeError`.

- [ ] **Step 3: Smoke-test the running server**

Run: `cd backend && npm run dev` (leave running), then in another terminal:

```bash
curl -i http://localhost:3001/health
```

Expected: `HTTP/1.1 200 OK` with the existing health JSON body, and an `X-Request-Id` header present on the response.

No commit for this task — verification only.

---

### Task 16: Frontend `ErrorBoundary` component

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        path: window.location.pathname,
      }),
    }).catch(() => {
      // Reporting failure must never cause a secondary crash.
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-900 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <p className="text-lg font-semibold text-white">משהו השתבש</p>
            <p className="text-sm text-slate-400">אירעה שגיאה בלתי צפויה. נסה לרענן את הדף.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium"
            >
              רענן דף
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

*(Styling classes match the existing loading/backend-down screens already in `App.tsx` — `bg-surface-900`, `sky-600` button — so the fallback looks native to the app rather than bolted on.)*

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ErrorBoundary.tsx
git commit -m "feat: add ErrorBoundary component for frontend crash recovery"
```

---

### Task 17: Wrap the app root in `ErrorBoundary`

**Files:**
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Wrap `<App />`**

Find (the whole current file):

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Replace with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: wrap App in ErrorBoundary"
```

---

### Task 18: End-to-end manual verification

**Files:**
- Temporarily modify (and then revert): `frontend/src/App.tsx`

- [ ] **Step 1: Start both dev servers**

Run: `npm run dev` from the repo root (starts backend on 3001 + frontend via Vite, per `scripts/dev.mjs`). Confirm both come up (backend log shows it listening, frontend log shows a local URL).

- [ ] **Step 2: Confirm the app loads normally**

Open the frontend URL (e.g. `http://localhost:5173`) in a browser. Expected: the app loads as it did before this plan — no visible change, since no error has occurred.

- [ ] **Step 3: Force a render crash to test the boundary**

Temporarily add a throw near the top of the `App` function body in `frontend/src/App.tsx` (right after `const { status, ... } = useAuth();`):

```ts
if (window.location.search.includes("test-crash")) {
  throw new Error("Deliberate test crash for ErrorBoundary verification");
}
```

Save, then visit `http://localhost:5173/?test-crash=1` in the browser.

Expected:
- The page shows the Hebrew "משהו השתבש" fallback screen with a "רענן דף" button instead of a white screen or a dev-overlay-only error.
- The browser's Network tab shows a `POST /api/client-error` request that returns `204`.
- The backend terminal (from Step 1) prints a JSON log line with `"errorType":"client"` and `"message":"Deliberate test crash for ErrorBoundary verification"`.
- Clicking "רענן דף" reloads the page and (since the URL still has `?test-crash=1`) shows the fallback again — confirming the reload path works; navigating away from `?test-crash=1` shows the app normally.

- [ ] **Step 4: Revert the temporary throw**

Remove the `if (window.location.search.includes("test-crash")) { throw ... }` block added in Step 3. Confirm `git diff frontend/src/App.tsx` is empty afterward.

- [ ] **Step 5: Spot-check a backend error path**

Pick any protected route the frontend already calls (e.g. loading the Tests tab, which hits `GET /tests` in `tests.ts`) and confirm it still works normally end-to-end — this confirms the refactored catch blocks didn't change the happy path.

Then confirm `X-Request-Id` is present on API responses: in the browser's Network tab, inspect any `/api/...` request's response headers.

No commit for this task (Step 4 explicitly leaves no diff) — this is the plan's final manual gate before reporting the work as ready for review. Per standing project preference, do not deploy to production until this has been reviewed and explicitly approved.
