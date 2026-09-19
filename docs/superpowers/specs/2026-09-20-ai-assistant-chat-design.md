# AI Assistant Chat ("Ask QA-Genius")

**Status:** Design — not yet implemented.

## Problem

QA-Genius already collects rich data about the user's own work — test runs, manual
STDs, log analyses, self-heal/flakiness history — but the only way to see any of it
is by navigating to the right tab and reading a table or chart. There's no way to
just *ask* a question ("what's my flakiest test?", "how many STDs did I write this
month?") and get a direct answer. A floating AI assistant that answers from the
user's real data (not a generic chatbot) is a strong, immediate "wow" signal for a
portfolio visitor, and demonstrates an actual agentic-AI pattern (tool-calling)
rather than just a wrapped completion call.

## Scope (v1)

Read-only Q&A only. The assistant cannot trigger actions (rerun a test, delete a
record, change settings) — answering questions about existing data is the entire
v1 surface. No conversation persistence: chat state lives in React state only and
resets on page reload (no new Prisma model, no new "clear history" UX to design).

## Design

### Backend: tool-calling agent

- New service `backend/src/services/assistant.ts`. Given a user message (plus the
  running conversation so far, for follow-ups), it runs a bounded tool-calling loop
  against the LLM: the model may call one or more read-only tools, receives their
  results, and either calls more tools or produces a final natural-language answer.
- **Tools wrap existing `db.ts` functions — no new queries are written.** Every tool
  takes the authenticated `userId` from the request and cannot be pointed at another
  user's data:
  - `getDashboardStats` → `getTestRunDashboardStats(userId)`
  - `listRecentTestRuns` → `listTestRuns(userId, limit)`
  - `getFlakinessStats` → also `getTestRunDashboardStats(userId)`, picking out its
    `flakyTests` (per-test pass/fail history — the actual "flakiest test" data) and
    `selfHeal` (aggregate self-heal counts/timing) fields. `getTestRunDashboardStats`
    already computes both internally via its own `getFlakyTests` (unexported) and
    `getSelfHealStats` (exported) helpers, so this tool adds no new query — it just re-shapes
    an existing result for the agent. `getDashboardStats` and `getFlakinessStats`
    calling the same underlying function twice in one turn is an accepted minor
    inefficiency for v1, not worth a shared-cache layer.
  - `listManualStds` → `listManualStds(userId)`
  - `listLogAnalyses` → `listLogAnalyses(userId)`
  - `listFeatures` → `listFeatureGroups(userId)`
- Reuses the existing key-resolution *policy* in `llm.ts` (`resolveKeys`: user key →
  server env key → mock mode) rather than introducing a second API-key path.
  `resolveKeys` is currently module-private, so it must be exported from `llm.ts`
  for `assistant.ts` to call it (or the same priority-chain logic is duplicated —
  exporting is preferred to avoid two copies of that policy).
  **The tool-calling loop itself is net-new code, not thin reuse:** the existing
  `callOpenAI`/`callAnthropic` helpers in `llm.ts` only do single-turn
  `system + user` text completions — there is no `tools`/function-calling
  parameter anywhere in the current codebase for either provider (verified: no
  `tool_use`/`tools:`/`tool_calls` usage exists yet). `assistant.ts` will need its
  own multi-round tool-calling implementation for both providers (tool-schema
  definitions, dispatch loop, response parsing) built from scratch on top of the
  `openai`/`@anthropic-ai/sdk` packages already installed — implementation
  planning should size it as new functionality, not glue code.
- **Mock mode:** when neither key is configured, the assistant returns a canned,
  clearly-labeled simulated answer (consistent with every other generator in the
  app) instead of erroring — the public demo experience stays intact.
- **Guardrail:** the tool-calling loop is capped at 5 rounds per message. If the cap
  is hit, the assistant returns whatever partial answer it can with a note that the
  question was too broad, instead of looping indefinitely — the same cost/runaway
  concern behind the separately-proposed "rate limiting / cost guardrails for LLM
  calls" feature idea (not yet its own spec; discussed alongside this one).
- New route: `POST /api/assistant/chat` in `backend/src/routes/assistant.ts`,
  mounted inside the existing `protectedRouter` in `app.ts` (alongside `testsRouter`,
  `showcaseRouter`, etc.) — so it's covered by the same `requireAuth` +
  `ensureDbUser` pair already applied once for all protected routes, and guest users
  get it for free like every other feature.
- Errors funnel through the existing `sendError`/`AppError` machinery from the
  centralized error-handling work — no parallel error path. A failed individual
  tool call is caught locally and reported back to the model as a tool error (so
  the agent can still answer with whatever data it *did* get) rather than aborting
  the whole request.

### Frontend

- New component (e.g. `AssistantWidget.tsx`) mounted once in `AppLayout`, next to
  `CommandPalette` — a floating button open from any tab, matching the ⌘K precedent
  for "global utility, not tab-scoped."
- Conversation state is local React state (`useState`), cleared on reload. No
  loading persistence, no server-side chat history model.

## Out of scope (v1)

- Actions/mutations from the assistant (rerunning tests, editing STDs, etc.).
- Persisted chat history or multi-device continuity.
- Per-user rate limiting / cost budgeting on assistant calls specifically (a
  separately-discussed feature idea, not duplicated here).
- Streaming token-by-token responses — v1 returns the full answer once the tool
  loop finishes; can be revisited later if latency is a problem.

## Testing plan

Manual verification on localhost only (no automated tests for a conversational
feature in this codebase's current testing style):

1. A question needing exactly one tool call (e.g. "how many tests ran this week?").
2. A question needing multiple tool calls / follow-up reasoning (e.g. "what's my
   flakiest test and when was it created?").
3. A question with no relevant data — the assistant should say so, not fabricate.
4. Mock mode (no `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` set) still returns a sane
   simulated response instead of an error.

Since every tool is read-only, no test-data cleanup is needed afterward (unlike
earlier features that left `TestRun`/`SelfHealEvent` rows behind). No push to
production without explicit sign-off, per standing project policy.
