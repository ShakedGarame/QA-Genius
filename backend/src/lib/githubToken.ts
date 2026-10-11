import type { Request } from "express";

/** User-supplied GitHub PAT from browser localStorage (sent per request). */
function extractUserGitHubToken(req: Request): string | undefined {
  const userHeader = req.headers["x-user-github-token"];
  if (typeof userHeader === "string" && userHeader.trim()) {
    return userHeader.trim();
  }

  const legacyHeader = req.headers["x-github-token"];
  if (typeof legacyHeader === "string" && legacyHeader.trim()) {
    return legacyHeader.trim();
  }

  const body = req.body as Record<string, unknown> | undefined;
  const bodyToken = body?.githubToken ?? body?.github_token;
  if (typeof bodyToken === "string" && bodyToken.trim()) {
    return bodyToken.trim();
  }

  return undefined;
}

/** True when the request carries its own PAT, which takes priority over the server's. */
export function hasUserGitHubToken(req: Request): boolean {
  return Boolean(extractUserGitHubToken(req));
}

export function extractGitHubTokenFromRequest(req: Request): string | undefined {
  const userToken = extractUserGitHubToken(req);
  if (userToken) return userToken;

  // Optional server-side fallback for ops (never required for end users).
  const envToken = process.env.GITHUB_ACTIONS_PAT?.trim();
  if (envToken) return envToken;

  return undefined;
}
