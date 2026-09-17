# Centralized Error Handling & Observability — Design

**Date:** 2026-09-17
**Status:** Approved for implementation
**Improvement #2** of 3 identified in the 2026-09-15/16 architecture review (see [[project-qa-genius-next-improvement]] memory; #1, guest data isolation, shipped in commit `69d5dcb`).

## Problem

The backend has no centralized error handling. 30 `catch` blocks across 9 route files (`analyze.ts` 3, `run.ts` 6, `generateStd.ts` 4, `tests.ts` 6, `testRuns.ts` 4, `logAnalyses.ts` 3, `issues.ts` 2, `upload.ts` 1, `generate.ts` 1) each independently do:

```ts
} catch (err: unknown) {
  return res.status(500).json({ error: err instanceof Error ? err.message : "..." });
}
```

This leaks raw Prisma/SDK/internal error messages straight to the client — this exact pattern (`Invalid prisma.feature.findMany() invocation...`) was the bug that surfaced improvement #1. A handful of routes (e.g. `issues.ts`) already hide the raw message behind a generic string, so the behavior is also inconsistent across the app.

There *is* a top-level Express error handler in `backend/src/app.ts` (lines 182–195), but it's a last-resort net for anything reaching it via `next(err)` — none of the existing route catches call `next(err)`; they all respond directly, so this handler never sees the bulk of the actual errors.

On the frontend, `App.tsx` has no React error boundary — an uncaught render exception is an unrecovered white screen.

No structured/correlation-ID logging exists anywhere; failures are logged ad hoc (some routes `console.error`, most don't).

## Non-goals

- No external error-tracking service (Sentry, etc.) — structured console logging only, visible via Vercel's log stream. (Explicitly decided against per user preference — can be added later without changing this design's shape.)
- No retry/backoff for external LLM calls — that's improvement #3, out of scope here.
- No automated test suite addition — this app has none yet; verification is manual on localhost, consistent with how improvement #1 was verified.

## Design

### Backend

**`backend/src/middleware/requestId.ts`** (new)
Assigns `req.id = randomUUID()` as the very first middleware in the chain (mounted in `app.ts` before everything else). Sets `X-Request-Id` on the response. Requires a TypeScript declaration merge (`declare module "express-serve-static-core" { interface Request { id: string } }` or similar) so `req.id` type-checks across route files.

**`backend/src/lib/errors.ts`** (new)
- `class AppError extends Error { statusCode: number; safeMessage: string }` — for intentional throws inside route logic where the message is already safe to show to the client (e.g. "Feature not found").
- `normalizeError(err: unknown): { status: number; safeMessage: string; errorType: string }`:
  | Error type | status | client message |
  |---|---|---|
  | `AppError` | its own `statusCode` | its own `safeMessage` |
  | Prisma `PrismaClientKnownRequestError` / `PrismaClientValidationError` | 500 | `"Database error, please try again"` |
  | `ZodError` | 400 | the Zod validation message (already safe/user-facing) — **note:** `zod` is not currently a dependency of the backend; it must be added to `backend/package.json` as part of this work |
  | OpenAI/Anthropic SDK error shapes (`status`/`code` fields present) | 502, or 429 if rate-limited | `"AI service temporarily unavailable, please try again"` |
  | anything else | 500 | `"Internal server error"` |
- `logError(req, err, errorType)` — writes one structured line: `console.error(JSON.stringify({ requestId: req.id, method, path, userId, errorType, message, stack }))`. Stack and raw message are server-side only, never sent to the client.
- `sendError(res, req, err)` — calls `normalizeError` + `logError`, then `res.status(status).json({ error: safeMessage, requestId: req.id })`.

**Refactor:** every existing `catch` block across the 9 route files replaces its inline `err instanceof Error ? err.message : "..."` logic with a call to `sendError(res, req, err)`. Same control flow, same status codes in the common case — only the message content and the added logging/requestId change.

**SSE routes** (`run.ts`, `analyze.ts`): same `normalizeError`/`logError` call, but instead of `res.json`, the existing SSE-send helper is used with the normalized message. Note these two files have different, differently-named helpers, not a shared one: `run.ts` has a module-level `sendSSE(res, event, data)` (its two error sites become `sendSSE(res, "error", { message: safeMessage, requestId: req.id })`); `analyze.ts` has two separate per-handler closures each named `sendEvent(event, data)` that capture `res` internally (their error sites become `sendEvent("error", { message: safeMessage, requestId: req.id })`, no `res` argument).

**Global handler** (`app.ts`): updated to call `normalizeError`/`logError` too, so anything that does reach it via `next(err)` gets the same safe-message + structured-log treatment instead of its current raw `err.message` passthrough.

### Frontend

**`frontend/src/components/ErrorBoundary.tsx`** (new)
Class component (`componentDidCatch`) wrapping the app root in `App.tsx`. On catch:
- Renders a fallback screen: "משהו השתבש" + a "רענן דף" button that reloads the page.
- Fires a fire-and-forget `POST /api/client-error` with `{ message, stack, componentStack, path: window.location.pathname }`. Failure to send is swallowed (no secondary crash loop).

**`backend/src/routes/errors.ts`** (new)
`POST /api/client-error` — unauthenticated (a render crash can happen pre-login), Zod-validates the body, calls `logError()` with `errorType: "client"`, responds `204`. Log-only — no DB persistence. Mounted the same way `authRouter` is: `app.use(errorsRouter)` alongside the other public routes in `app.ts`, *outside* the `requireAuth`/`ensureDbUser`-protected `/api` block — not nested inside `protectedRouter`, which would contradict the unauthenticated requirement.

### Data flow

```
request → requestId middleware (req.id) → route handler
  → on throw: existing catch → sendError(res, req, err)
    → normalizeError (safe message + status) + logError (full detail, keyed by req.id)
    → client receives { error: safeMessage, requestId }
  → uncaught error → next(err) → global handler (same normalize/log path)

frontend render crash → ErrorBoundary.componentDidCatch
  → fallback UI shown
  → POST /api/client-error → logError (errorType: "client")
```

## Testing plan

- Backend: locally trigger a Prisma error (bad query) and a Zod validation failure on a couple of routes; confirm the client gets the generic safe message + `requestId`, and the full error detail appears in the server console log under that same `requestId`.
- Frontend: temporarily throw inside a component to confirm the boundary renders the fallback instead of a white screen, and that `/api/client-error` is received and logged server-side.
- Manual verification on localhost only, per standing preference — no push to production without explicit review and approval first.
