import type { Request } from "express";
import type { DbUserSettings } from "../db.js";

/**
 * Resolve OpenAI key for this request.
 * Priority: x-user-openai-key → x-openai-key → body openaiApiKey → Authorization Bearer → user DB settings.
 */
export function extractOpenAIKeyFromRequest(
  req: Request,
  userSettings?: DbUserSettings | null
): string | undefined {
  const userHeader = req.headers["x-user-openai-key"];
  if (typeof userHeader === "string" && userHeader.trim()) {
    return userHeader.trim();
  }

  const headerKey = req.headers["x-openai-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const body = req.body as Record<string, unknown> | undefined;
  const bodyKey = body?.openaiApiKey ?? body?.openai_api_key;
  if (typeof bodyKey === "string" && bodyKey.trim()) {
    return bodyKey.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("sk-")) return token;
  }

  const dbKey = userSettings?.openai_api_key?.trim();
  if (dbKey) return dbKey;

  return undefined;
}
