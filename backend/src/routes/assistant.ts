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
