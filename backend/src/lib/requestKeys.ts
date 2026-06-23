import type { Request } from "express";
import type { DbUserSettings } from "../db.js";

/**
 * Resolve OpenAI key for this request.
 * Priority: x-openai-key header → Authorization Bearer → user DB settings.
 */
export function extractOpenAIKeyFromRequest(
  req: Request,
  userSettings?: DbUserSettings | null
): string | undefined {
  const headerKey = req.headers["x-openai-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  const dbKey = userSettings?.openai_api_key?.trim();
  if (dbKey) return dbKey;

  return undefined;
}
