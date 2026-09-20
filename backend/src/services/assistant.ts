import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveKeys, OPENAI_MODEL, ANTHROPIC_MODEL } from "./llm.js";
import { ASSISTANT_TOOLS, executeAssistantTool } from "./assistantTools.js";

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
  return (
    "השאלה הזו דרשה יותר מדי שלבים כדי לענות עליה — נסה לפרק אותה לכמה שאלות קטנות יותר.\n" +
    "This question required too many steps to answer — try breaking it into smaller questions."
  );
}

function noReplyFallback(): string {
  return (
    "מצטער, לא הצלחתי להפיק תשובה כרגע.\n" +
    "Sorry, I couldn't produce a reply right now."
  );
}

/** `content ?? fallback` doesn't catch a legitimate `content: ""` (a real
 * possibility, e.g. a completion cut off by content filtering) — only
 * null/undefined. This treats blank/whitespace-only text the same as missing. */
function nonBlank(text: string | null | undefined): string | undefined {
  return text && text.trim().length > 0 ? text : undefined;
}

// ─── OpenAI (function-calling) ─────────────────────────────────────────────────

async function runOpenAiAssistant(
  userId: string,
  history: ChatMessage[],
  apiKey: string
): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const tools: OpenAI.Chat.ChatCompletionTool[] = ASSISTANT_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      // AssistantToolParam is JSON-schema-shaped but declared without an index
      // signature, so it doesn't structurally satisfy FunctionParameters
      // (Record<string, unknown>) — cast rather than loosen the shared type.
      parameters: t.parameters as unknown as OpenAI.FunctionParameters,
    },
  }));

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.ChatCompletionMessageParam),
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
    if (!message) {
      return noReplyFallback();
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return nonBlank(message.content) ?? noReplyFallback();
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

  // The loop above always ends on a tool-call round (any round that returns a
  // plain answer exits early via `return message.content`), so the final
  // round's tool results are sitting in `messages` unused. Make one more,
  // tools-less call so the model actually answers using them instead of
  // discarding data it already successfully fetched.
  const finalResponse = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: 0.2,
    max_tokens: 800,
  });
  return nonBlank(finalResponse.choices[0]?.message?.content) ?? tooComplexReply();
}

// ─── Anthropic (tool-use) ───────────────────────────────────────────────────────

/** Anthropic's Messages API requires the conversation to start with role
 * "user" and to strictly alternate user/assistant. A client-side retry after
 * a failed send (or the route's own content-length/blank filtering dropping
 * a message out of the middle of the array) can otherwise leave a leading
 * non-user message or two consecutive same-role messages, which Anthropic
 * rejects with a 400. Trim any leading non-user messages, then merge any
 * consecutive same-role turns into one (joined by a blank line) so the
 * result is always valid regardless of what shape the caller's history is in. */
function normalizeForAnthropic(history: ChatMessage[]): Anthropic.MessageParam[] {
  const firstUserIndex = history.findIndex((m) => m.role === "user");
  const trimmed = firstUserIndex === -1 ? [] : history.slice(firstUserIndex);

  const merged: Anthropic.MessageParam[] = [];
  for (const m of trimmed) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role && typeof last.content === "string") {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      merged.push({ role: m.role, content: m.content });
    }
  }
  return merged;
}

async function runAnthropicAssistant(
  userId: string,
  history: ChatMessage[],
  apiKey: string
): Promise<string> {
  const Anthropic = await import("@anthropic-ai/sdk");
  const client = new Anthropic.default({ apiKey });

  const tools: Anthropic.Tool[] = ASSISTANT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    // Same structural-cast rationale as the OpenAI branch above.
    input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = normalizeForAnthropic(history);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages,
      tools,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return nonBlank(textBlock?.text) ?? noReplyFallback();
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeAssistantTool(
        userId,
        block.name,
        (block.input ?? {}) as Record<string, unknown>
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Same rationale as the OpenAI branch above: the last round's tool results
  // are unused otherwise. One final, tools-less call forces a text answer.
  const finalResponse = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 800,
    system: ASSISTANT_SYSTEM_PROMPT,
    messages,
  });
  const finalTextBlock = finalResponse.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  return nonBlank(finalTextBlock?.text) ?? tooComplexReply();
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
