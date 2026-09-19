# AI Assistant Chat ("Ask QA-Genius") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating, global AI chat widget that answers questions about the signed-in user's own QA-Genius data (test runs, STDs, log analyses, flakiness) using a tool-calling LLM agent, for both OpenAI and Anthropic.

**Architecture:** A new backend service (`assistantTools.ts` + `assistant.ts`) runs a bounded (max 5 rounds) tool-calling loop against whichever LLM provider is configured, where every tool is a thin, trimmed wrapper around an already-exported `db.ts` read function scoped to `userId`. A new route exposes this at `POST /api/assistant/chat`, mounted in the existing `protectedRouter`. A new frontend widget (self-contained floating button + panel, ephemeral React state only) calls that route.

**Tech Stack:** Express + TypeScript (backend), React + TypeScript + Tailwind (frontend), `openai` v4 SDK (function-calling), `@anthropic-ai/sdk` v0.27 SDK (tool-use) — both already installed, neither currently used for tool-calling anywhere in this codebase.

**Spec:** `docs/superpowers/specs/2026-09-20-ai-assistant-chat-design.md`

**⚠️ Testing note (read before starting):** This codebase has **no automated test framework** (no jest/vitest in `backend/package.json`, no unit tests anywhere). Every other feature in this app was verified manually against the running dev server. This plan follows that same convention: "test" steps below are manual `curl`/browser verification against `npm run dev`, not unit test files. Do not introduce a new test framework as part of this plan — that would be unrelated scope creep.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/services/llm.ts` (modify) | Export the existing `resolveKeys` function so `assistant.ts` can reuse the same user-key → server-key → mock priority chain instead of duplicating it. |
| `backend/src/services/assistantTools.ts` (create) | The tool registry: one entry per tool with its JSON-schema parameters and an `execute(userId, args)` implementation that calls an existing `db.ts` function and trims the result to a small, LLM-friendly shape. No LLM/provider code here. |
| `backend/src/services/assistant.ts` (create) | The provider-agnostic chat entry point (`runAssistantChat`) plus the two tool-calling loops (`runOpenAiAssistant`, `runAnthropicAssistant`) and the mock-mode fallback. Imports tools from `assistantTools.ts`. |
| `backend/src/routes/assistant.ts` (create) | `POST /assistant/chat` — validates the request body, resolves the OpenAI key the same way every other route does, calls `runAssistantChat`, returns the reply. |
| `backend/src/app.ts` (modify) | Import and mount the new router inside the existing `protectedRouter`. |
| `frontend/src/components/Layout/AssistantWidget.tsx` (create) | Self-contained floating chat button + panel. Owns its own open/closed and message-list state (no props needed). |
| `frontend/src/components/Layout/AppLayout.tsx` (modify) | Mount `<AssistantWidget />` once, next to `<CommandPalette .../>`. |

---

## Task 1: Export `resolveKeys` from `llm.ts`

**Files:**
- Modify: `backend/src/services/llm.ts:37`

- [ ] **Step 1: Add the `export` keyword**

Change:
```ts
function resolveKeys(options: { openaiKey?: string; anthropicKey?: string } = {}): ResolvedKeys {
```
to:
```ts
export function resolveKeys(options: { openaiKey?: string; anthropicKey?: string } = {}): ResolvedKeys {
```

Also add `export` to the `ResolvedKeys` interface a few lines above it, so the return type can be imported too:
```ts
export interface ResolvedKeys {
  openaiKey: string | null;
  anthropicKey: string | null;
  isMock: boolean;
}
```

- [ ] **Step 2: Verify the backend still typechecks**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors (this is a pure additive export — every existing internal call site is unaffected).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/llm.ts
git commit -m "refactor: export resolveKeys so other services can reuse the AI key-resolution chain"
```

---

## Task 2: Tool registry (`assistantTools.ts`)

**Files:**
- Create: `backend/src/services/assistantTools.ts`

This file has one job: define what the assistant is allowed to look up, and make sure every tool result is small and scoped to the requesting user. No network/LLM code lives here.

- [ ] **Step 1: Write the file**

```ts
import {
  getTestRunDashboardStats,
  listTestRuns,
  listManualStds,
  listLogAnalyses,
  listFeatureGroups,
} from "../db.js";

/** JSON-schema-ish shape both OpenAI (function parameters) and Anthropic
 * (tool input_schema) accept as-is. */
export interface AssistantToolParam {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface AssistantTool {
  name: string;
  description: string;
  parameters: AssistantToolParam;
  execute: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const NO_PARAMS: AssistantToolParam = { type: "object", properties: {} };

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    name: "get_dashboard_stats",
    description:
      "Get aggregate test-run stats for this user: total/passed/failed/running run counts, " +
      "pass rate percent, and average run duration. Use for questions like 'how many tests ran' " +
      "or 'what's my pass rate'.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const stats = await getTestRunDashboardStats(userId);
      return {
        totalRuns: stats.totalRuns,
        completedRuns: stats.completedRuns,
        runningRuns: stats.runningRuns,
        passedRuns: stats.passedRuns,
        failedRuns: stats.failedRuns,
        passRatePercent: stats.passRatePercent,
        averageDurationMs: stats.averageDurationMs,
      };
    },
  },
  {
    name: "list_recent_test_runs",
    description:
      "List the user's most recent test runs (feature, file, status, duration, when it ran). " +
      "Use for questions about specific recent runs, not aggregate stats.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max runs to return, default 10, max 30." },
      },
    },
    execute: async (userId, args) => {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
      const runs = await listTestRuns(userId, limit);
      return runs.map((r) => ({
        feature: r.feature_name,
        file: r.test_file_name,
        status: r.status,
        durationMs: r.duration_ms,
        createdAt: r.created_at,
      }));
    },
  },
  {
    name: "get_flakiness_stats",
    description:
      "Get the user's flakiest tests (same file with both a pass and a fail in its recent " +
      "history) and self-heal statistics (how often auto-healing ran, average duration). " +
      "Use for questions like 'what's my flakiest test' or 'how well does self-heal perform'.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      // getTestRunDashboardStats already computes both of these internally — no new query.
      const stats = await getTestRunDashboardStats(userId);
      return {
        flakyTests: stats.flakyTests.map((t) => ({
          feature: t.featureName,
          file: t.testFileName,
          passedCount: t.passedCount,
          failedCount: t.failedCount,
          lastStatus: t.lastStatus,
          lastRunAt: t.lastRunAt,
        })),
        selfHeal: stats.selfHeal,
      };
    },
  },
  {
    name: "list_manual_stds",
    description:
      "List the user's manually generated Standard Test Documentation (STD) records: " +
      "feature name, detected domain, how many test cases each has, when created. " +
      "Use for questions like 'how many STDs did I write'.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const stds = await listManualStds(userId);
      return stds.slice(0, 20).map((s) => ({
        featureName: s.feature_name,
        domain: s.domain,
        testCaseCount: s.test_cases.length,
        isMock: s.is_mock,
        createdAt: s.created_at,
      }));
    },
  },
  {
    name: "list_log_analyses",
    description:
      "List the user's AI log-analysis results: feature, severity, category, root cause, " +
      "when analyzed. Use for questions about past failure investigations.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const analyses = await listLogAnalyses(userId);
      return analyses.slice(0, 20).map((a) => ({
        feature: a.feature_name,
        source: a.source,
        severity: a.severity,
        category: a.category,
        rootCause: a.root_cause,
        createdAt: a.created_at,
      }));
    },
  },
  {
    name: "list_features",
    description:
      "List the user's tracked features/user-flows: name, how many generated test files each " +
      "has, and the status of its most recent run. Use for coverage-style questions.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const groups = await listFeatureGroups(userId);
      return groups.slice(0, 30).map((g) => ({
        featureName: g.meta.featureName,
        testCount: g.tests.length,
        latestRunStatus: g.meta.latestRunStatus ?? null,
        lastRunAt: g.meta.lastRunAt ?? null,
      }));
    },
  },
];

export function findAssistantTool(name: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}

/** Runs a tool by name and never throws — a failed tool becomes a `{ error }`
 * object the model can see and work around, instead of aborting the whole chat. */
export async function executeAssistantTool(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = findAssistantTool(name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(userId, args);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}
```

- [ ] **Step 2: Manual verification — run each tool directly against real data**

Create a throwaway script and do not commit it — it's a one-off manual check,
run directly against the real TS source via `tsx` (already a dependency):

`backend/scripts/check-assistant-tools.tmp.ts`:
```ts
import { ASSISTANT_TOOLS } from "../src/services/assistantTools.js";
import { getOrCreateLocalDevUser } from "../src/db.js";

const user = await getOrCreateLocalDevUser();
for (const tool of ASSISTANT_TOOLS) {
  const result = await tool.execute(user.id, {});
  console.log(`\n=== ${tool.name} ===`);
  console.log(JSON.stringify(result, null, 2).slice(0, 800));
}
process.exit(0);
```

Run: `cd backend && npx tsx scripts/check-assistant-tools.tmp.ts`
Expected: six sections print, each valid JSON, none throwing, none dumping huge
blobs (if `list_manual_stds`/`list_log_analyses` output looks too large, that's a
sign a field wasn't trimmed — fix before moving on).

Delete the throwaway script when done: `rm backend/scripts/check-assistant-tools.tmp.ts`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/assistantTools.ts
git commit -m "feat: add read-only tool registry for the AI assistant"
```

---

## Task 3: The chat loop (`assistant.ts`)

**Files:**
- Create: `backend/src/services/assistant.ts`

- [ ] **Step 1: Write the file**

```ts
import { resolveKeys } from "./llm.js";
import { ASSISTANT_TOOLS, executeAssistantTool } from "./assistantTools.js";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const MAX_TOOL_ROUNDS = 5;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantChatResult {
  reply: string;
  isMock: boolean;
  model: string;
}

const ASSISTANT_SYSTEM_PROMPT = `\
You are the QA-Genius in-app assistant. You answer questions about THIS user's own
testing data — test runs, STDs, log analyses, flakiness — using only the tools
provided. Never invent numbers or test names that didn't come from a tool result.
If a question needs data no tool can provide, say so plainly instead of guessing.
Answer in the same language the user wrote in (Hebrew or English). Keep answers
short and concrete — a sentence or two, or a short list, not an essay.`;

function tooComplexReply(): string {
  return "השאלה הזו דרשה יותר מדי שלבים כדי לענות עליה — נסה לפרק אותה לכמה שאלות קטנות יותר.";
}

// ─── OpenAI (function-calling) ─────────────────────────────────────────────────

async function runOpenAiAssistant(
  userId: string,
  history: ChatMessage[],
  apiKey: string
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const tools = ASSISTANT_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const messages: any[] = [
    { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools,
      temperature: 0.2,
      max_tokens: 800,
    });

    const message = response.choices[0]?.message;
    if (!message) return "מצטער, לא הצלחתי להפיק תשובה כרגע.";

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "";
    }

    messages.push(message);

    for (const call of message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // malformed args from the model — fall through with {} so the tool
        // still runs with defaults rather than the whole turn erroring out.
      }
      const result = await executeAssistantTool(userId, call.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return tooComplexReply();
}

// ─── Anthropic (tool-use) ───────────────────────────────────────────────────────

async function runAnthropicAssistant(
  userId: string,
  history: ChatMessage[],
  apiKey: string
): Promise<string> {
  const Anthropic = await import("@anthropic-ai/sdk");
  const client = new Anthropic.default({ apiKey });

  const tools = ASSISTANT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  let messages: any[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find((b: any) => b.type === "text") as
        | { type: "text"; text: string }
        | undefined;
      return textBlock?.text ?? "";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      const result = await executeAssistantTool(userId, block.name, block.input ?? {});
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return tooComplexReply();
}

// ─── Mock mode ──────────────────────────────────────────────────────────────────

function buildMockAssistantReply(): string {
  return (
    "⚠️ MOCK MODE — הוסף OPENAI_API_KEY או ANTHROPIC_API_KEY כדי לקבל תשובות אמיתיות " +
    "המבוססות על הנתונים שלך.\n\n" +
    "בדרך כלל הייתי בודק כאן את ריצות הבדיקות, ה-STDs והיציבות שלך ועונה ישירות על " +
    "השאלה שלך."
  );
}

// ─── Public entry point ─────────────────────────────────────────────────────────

export async function runAssistantChat(
  userId: string,
  history: ChatMessage[],
  options: { openaiKey?: string; anthropicKey?: string } = {}
): Promise<AssistantChatResult> {
  const { openaiKey, anthropicKey, isMock } = resolveKeys(options);

  if (isMock) {
    return { reply: buildMockAssistantReply(), isMock: true, model: "mock" };
  }

  if (openaiKey) {
    const reply = await runOpenAiAssistant(userId, history, openaiKey);
    return { reply, isMock: false, model: OPENAI_MODEL };
  }

  const reply = await runAnthropicAssistant(userId, history, anthropicKey as string);
  return { reply, isMock: false, model: ANTHROPIC_MODEL };
}
```

Note: `any` is used for the two providers' message-array types because the OpenAI
and Anthropic SDKs each have their own message/content union types that are
awkward to hand-annotate correctly without the SDKs' exported helper types: if
`npx tsc --noEmit` (next step) complains about a specific line, replace that
`any` with the SDK's actual exported type (e.g.
`OpenAI.Chat.ChatCompletionMessageParam[]`, `Anthropic.MessageParam[]`) rather
than suppressing the error — this is the one place in the plan where the exact
type name depends on the installed SDK version, so let the compiler tell you.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors. Fix any SDK type mismatches as noted above before continuing.

- [ ] **Step 3: Manual verification — mock mode**

```bash
cd backend && npx tsx -e "
import { runAssistantChat } from './src/services/assistant.ts';
import { getOrCreateLocalDevUser } from './src/db.ts';
const user = await getOrCreateLocalDevUser();
const result = await runAssistantChat(user.id, [{ role: 'user', content: 'How many tests ran?' }], {});
console.log(result);
"
```
Expected (assuming no `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` set in your local
`.env`): `{ reply: '⚠️ MOCK MODE...', isMock: true, model: 'mock' }`.

If you *do* have a real key configured locally, this will make a real LLM call
instead — that's fine, just confirm `isMock: false` and that `reply` is a real,
on-topic answer instead of an error.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/assistant.ts
git commit -m "feat: add tool-calling AI assistant chat loop (OpenAI + Anthropic)"
```

---

## Task 4: Route (`routes/assistant.ts`)

**Files:**
- Create: `backend/src/routes/assistant.ts`

- [ ] **Step 1: Write the file**

```ts
import { Router, Request, Response } from "express";
import type { DbUser } from "../db.js";
import { getUserSettings } from "../db.js";
import { extractOpenAIKeyFromRequest } from "../lib/requestKeys.js";
import { runAssistantChat, type ChatMessage } from "../services/assistant.js";
import { sendError } from "../lib/errors.js";

const router = Router();

const MAX_HISTORY_MESSAGES = 20;

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.role === "user" || v.role === "assistant") && typeof v.content === "string";
}

router.post("/assistant/chat", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;

  const rawMessages = (req.body as { messages?: unknown }).messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  const messages = rawMessages.filter(isChatMessage).slice(-MAX_HISTORY_MESSAGES);
  if (messages.length === 0) {
    return res.status(400).json({ error: "No valid messages provided" });
  }

  try {
    const userSettings = await getUserSettings(userId);
    // Same key-resolution convention as every other AI route in this codebase
    // (generate.ts, generateStd.ts, analyze.ts): only OpenAI has a per-request
    // user-key override today. Anthropic falls back to the server env key.
    const openaiKey = extractOpenAIKeyFromRequest(req, userSettings);
    const result = await runAssistantChat(userId, messages, { openaiKey });
    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Assistant failed to respond" });
  }
});

export default router;
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/assistant.ts
git commit -m "feat: add POST /api/assistant/chat route"
```

---

## Task 5: Mount the route

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Import the router**

Add near the other route imports (around line 28, after `issuesRouter`):
```ts
import issuesRouter from "./routes/issues.js";
import assistantRouter from "./routes/assistant.js";
```

- [ ] **Step 2: Mount it in the protected router**

Find the `protectedRouter.use(...)` block and add the new router (order among
these doesn't matter — they're all mounted on distinct paths):
```ts
protectedRouter.use(issuesRouter);
protectedRouter.use(assistantRouter);
protectedRouter.use(showcaseRouter);
```

- [ ] **Step 3: Start the backend and verify the route is live**

Run: `cd backend && npm run dev` (leave running in one terminal)

In another terminal, hit the health check first to confirm the server booted:
```bash
curl -s http://localhost:3001/health | head -c 300
```
(Adjust the port if your local backend runs on a different one — check
`backend/src/index.ts` or your `.env` for `PORT` if `3001` doesn't respond.)

Then, since `/api/assistant/chat` requires auth, verify it correctly rejects an
unauthenticated request instead of crashing:
```bash
curl -s -X POST http://localhost:3001/api/assistant/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
```
Expected: a 401/redirect-style auth response (matching how every other
`/api/*` route behaves unauthenticated) — NOT a 500 or a stack trace. This
confirms the router is mounted behind `requireAuth` correctly.

Full end-to-end verification (with a real session cookie) happens in Task 7
once the frontend can drive it — this step only confirms wiring.

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.ts
git commit -m "feat: mount assistant router in the protected API"
```

---

## Task 6: Frontend widget

**Files:**
- Create: `frontend/src/components/Layout/AssistantWidget.tsx`

- [ ] **Step 1: Write the component**

Follows the same `fetch(..., { credentials: "include" })` pattern used in
`ShowcaseModal.tsx`, and the same Tailwind surface/sky color conventions used
in `CommandPalette.tsx`.

```tsx
import { useRef, useState } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import clsx from "clsx";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Global floating AI assistant — answers questions about the signed-in user's
 * own QA-Genius data (test runs, STDs, log analyses, flakiness). Self-contained:
 * owns its own open/closed and conversation state. Conversation is intentionally
 * ephemeral — it resets on page reload, there's no server-side chat history. */
export default function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: nextMessages }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Assistant failed to respond");
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply as string }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant failed to respond");
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-400 text-white shadow-2xl flex items-center justify-center transition-colors"
        aria-label={isOpen ? "Close assistant" : "Open assistant"}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div
          className="fixed bottom-20 right-5 z-[60] w-[min(360px,calc(100vw-2.5rem))] max-h-[70vh] bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="AI assistant"
        >
          <div className="px-4 py-3 border-b border-surface-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400" aria-hidden />
            <p className="text-sm font-medium text-slate-100">Ask QA-Genius</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[160px]">
            {messages.length === 0 && (
              <p className="text-sm text-slate-500">
                Ask me about your test runs, STDs, or flaky tests.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  "text-sm rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-sky-500/15 text-white ml-auto"
                    : "bg-surface-700 text-slate-200"
                )}
              >
                {m.content}
              </div>
            ))}
            {error && (
              <div className="text-sm rounded-xl px-3 py-2 bg-red-500/10 text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-surface-600 flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question…"
              className="flex-1 bg-surface-700 text-sm text-slate-100 placeholder:text-slate-500 rounded-lg px-3 py-2 outline-none"
              disabled={isSending}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              className="w-9 h-9 flex-shrink-0 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-white flex items-center justify-center transition-colors"
              aria-label="Send"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Layout/AssistantWidget.tsx
git commit -m "feat: add AssistantWidget floating chat UI"
```

---

## Task 7: Mount the widget and do full end-to-end verification

**Files:**
- Modify: `frontend/src/components/Layout/AppLayout.tsx`

- [ ] **Step 1: Import and mount**

Add the import near the `CommandPalette` import (around line 19):
```ts
import CommandPalette, { CommandItem } from "./CommandPalette";
import AssistantWidget from "./AssistantWidget";
```

Add `<AssistantWidget />` next to where `<CommandPalette .../>` is rendered —
search for that JSX tag rather than trusting a line number, since this file
already has other in-progress uncommitted edits shifting line numbers around.
No props needed, it's self-contained:
```tsx
<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
<AssistantWidget />
```

- [ ] **Step 2: Full manual end-to-end verification**

Use the `webapp-testing` skill (or a plain browser) against the full dev stack:

```bash
npm run dev   # from repo root — starts backend + frontend together
```

Then, signed in as any user (guest sign-in is fine):

1. Click the floating sparkle button bottom-right — the chat panel opens.
2. Ask a question needing exactly one tool call: "how many tests ran?" — confirm
   a real, on-topic answer appears (or the MOCK MODE banner if no AI key is
   configured locally) within a few seconds, not an error bubble.
3. Ask a question needing multiple tool calls / reasoning: "what's my flakiest
   test and when did it last run?" — confirm the answer references an actual
   test from your data (or says there isn't enough data yet, if your local DB
   has no flaky tests — don't expect a fabricated test name).
4. Ask something with no relevant data at all (e.g. "what's the weather today?")
   — confirm the assistant says it doesn't have that information rather than
   inventing an answer.
5. Reload the page — confirm the conversation is gone (ephemeral, as designed)
   and the widget starts fresh.
6. Open the browser's Network tab during step 2 — confirm the request went to
   `POST /api/assistant/chat` and returned `200` with a JSON body containing
   `reply`/`isMock`/`model`, not a raw 500.

Since every tool underneath is read-only, there is nothing to clean up in the
database afterward.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout/AppLayout.tsx
git commit -m "feat: mount AssistantWidget globally in AppLayout"
```

---

## Done — do not push to production

Per standing project policy, stop here after localhost verification. Do not
run any deploy/push-to-prod command — that requires the user's explicit,
separate go-ahead.
