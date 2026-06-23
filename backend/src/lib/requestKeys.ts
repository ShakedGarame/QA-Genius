import type { Request } from "express";
import type { DbUserSettings } from "../db.js";

/**
 * Resolve OpenAI key for this request.
 * Priority: body openaiApiKey → x-user-openai-key → x-openai-key → DB → Authorization Bearer (sk- only).
 */
export function extractOpenAIKeyFromRequest(
  req: Request,
  userSettings?: DbUserSettings | null
): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  const bodyKey = body?.openaiApiKey ?? body?.openai_api_key;
  if (typeof bodyKey === "string" && bodyKey.trim()) {
    return bodyKey.trim();
  }

  const userHeader = req.headers["x-user-openai-key"];
  if (typeof userHeader === "string" && userHeader.trim()) {
    return userHeader.trim();
  }

  const headerKey = req.headers["x-openai-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const dbKey = userSettings?.openai_api_key?.trim();
  if (dbKey) return dbKey;

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("sk-")) return token;
  }

  return undefined;
}

export type OpenAIKeySource = "body" | "header" | "database" | "none";

export function resolveOpenAIKeySource(
  req: Request,
  userSettings?: DbUserSettings | null
): { key?: string; source: OpenAIKeySource } {
  const body = req.body as Record<string, unknown> | undefined;
  const bodyKey = body?.openaiApiKey ?? body?.openai_api_key;
  if (typeof bodyKey === "string" && bodyKey.trim()) {
    return { key: bodyKey.trim(), source: "body" };
  }

  const userHeader = req.headers["x-user-openai-key"];
  if (typeof userHeader === "string" && userHeader.trim()) {
    return { key: userHeader.trim(), source: "header" };
  }

  const headerKey = req.headers["x-openai-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return { key: headerKey.trim(), source: "header" };
  }

  const dbKey = userSettings?.openai_api_key?.trim();
  if (dbKey) return { key: dbKey, source: "database" };

  return { source: "none" };
}
