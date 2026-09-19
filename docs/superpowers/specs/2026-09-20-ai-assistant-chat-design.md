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
  - `getFlakinessStats` → `getSelfHealStats(userId)` (flakiest tests, self-heal counts)
  - `listManualStds` → `listManualStds(userId)`
  - `listLogAnalyses` → `listLogAnalyses(userId)`
  - `listFeatures` → `listFeatureGroups(userId)`
- Reuses the existing key-resolution chain in `llm.ts` (`resolveKeys`: user key →
  server env key → mock mode) rather than introducing a second API-key path. Both
  supported providers (OpenAI function-calling, Anthropic tool-use) are implemented,
  matching how the rest of the app already lets either provider serve a request.
- **Mock mode:** when neither key is configured, the assistant returns a canned,
  clearly-labeled simulated answer (consistent with every other generator in the
  app) instead of erroring — the public demo experience stays intact.
- **Guardrail:** the tool-calling loop is capped at 5 rounds per message. If the cap
  is hit, the assistant returns whatever partial answer it can with a note that the
  question was too broad, instead of looping indefinitely (the same cost/runaway
  concern flagged for the separate rate-limiting item on the engineering roadmap).
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
- Per-user rate limiting / cost budgeting on assistant calls specifically (tracked
  separately as its own engineering-roadmap item, not duplicated here).
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
