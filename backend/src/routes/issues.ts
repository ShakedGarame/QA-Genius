import { Router, Request, Response } from "express";
import { getUserSettings } from "../db.js";
import type { DbUser } from "../db.js";
import { sendError } from "../lib/errors.js";

const router = Router();

function getUser(req: Request): DbUser | null {
  return (req.user as DbUser) ?? null;
}

// Accepts "owner/repo" as-is, but also tolerates a pasted GitHub URL
// (e.g. "https://github.com/owner/repo" or ".../owner/repo/issues").
function normalizeGithubRepo(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/]+)/i);
  const repo = match ? match[1] : trimmed;
  return repo.replace(/\.git$/i, "");
}

// POST /api/issues/github/create
router.post("/issues/github/create", async (req: Request, res: Response) => {
  const { title, body, labels } = req.body as {
    title: string;
    body?: string;
    labels?: string[];
  };

  const user = getUser(req);
  const isGuest = !!user?.is_guest;

  // Header token (user's own PAT) always allowed — it's their own credential,
  // not the owner's. The env-configured token is the owner's personal PAT,
  // so guests never fall back to it (see guest-data-isolation design doc).
  const token =
    (req.headers["x-github-token"] as string | undefined) ||
    (req.headers["x-user-github-token"] as string | undefined) ||
    (isGuest ? undefined : process.env.GITHUB_ISSUES_TOKEN) ||
    (isGuest ? undefined : process.env.GITHUB_TOKEN);

  // Repo: user settings win over env var (enables per-user targeting).
  const settings = user ? await getUserSettings(user.id) : null;
  const rawRepo = settings?.github_issues_repo || process.env.GITHUB_ISSUES_REPO;
  const repo = rawRepo ? normalizeGithubRepo(rawRepo) : rawRepo;

  if (!token) {
    return res.status(503).json({
      error: isGuest
        ? "Sign in to file a GitHub issue, or paste your own GitHub token in Settings."
        : "GitHub token not configured. Set GITHUB_ISSUES_TOKEN in your environment, or add a GitHub PAT in Settings.",
    });
  }
  if (!repo) {
    return res.status(503).json({
      error:
        "Target repository not configured. Add the repository path (owner/repo) in Settings → GitHub Issues, or set GITHUB_ISSUES_REPO in your environment.",
    });
  }
  if (!title?.trim()) {
    return res.status(400).json({ error: "'title' is required" });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: title.trim(),
        body: body ?? "",
        labels: labels ?? ["bug"],
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: (data.message as string) ?? "GitHub API error" });
    }

    return res.json({
      success: true,
      issueUrl: data.html_url,
      issueNumber: data.number,
    });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to create GitHub issue. Please try again." });
  }
});

// Accepts "myco.atlassian.net" as-is, but also tolerates a pasted Jira URL
// (e.g. "https://myco.atlassian.net/jira/software/projects/SCRUM/boards/1").
function normalizeJiraDomain(raw: string): string {
  const trimmed = raw.trim();
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.replace(/\/.*$/, "");
  }
}

// Pulls a project key out of a pasted Jira project/board URL, e.g.
// ".../jira/software/projects/SCRUM/boards/1" -> "SCRUM".
function extractProjectKeyFromUrl(raw: string): string | null {
  const match = raw.match(/\/projects\/([A-Z0-9]+)(?:[/?]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

// Team-managed Jira projects don't always have "Bug" enabled as an issue
// type, so look up what the project actually supports instead of assuming.
// Falls back to "Task" (present on virtually every project) if the lookup
// itself fails.
async function resolveJiraIssueType(
  domain: string,
  projectKey: string,
  credentials: string
): Promise<{ id?: string; name: string }> {
  try {
    const res = await fetch(
      `https://${domain}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`,
      { headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" } }
    );
    if (!res.ok) return { name: "Task" };

    const data = (await res.json()) as {
      issueTypes?: { id: string; name: string; subtask?: boolean }[];
    };
    const types = (data.issueTypes ?? []).filter((t) => !t.subtask);
    const preferred =
      types.find((t) => t.name.toLowerCase() === "bug") ??
      types.find((t) => t.name.toLowerCase() === "task") ??
      types[0];

    return preferred ? { id: preferred.id, name: preferred.name } : { name: "Task" };
  } catch {
    return { name: "Task" };
  }
}

// POST /api/issues/jira/create
router.post("/issues/jira/create", async (req: Request, res: Response) => {
  const { title, description, projectKey } = req.body as {
    title: string;
    description?: string;
    projectKey: string;
  };

  // User settings take priority over env vars for Jira credentials. The env
  // vars are the owner's own personal Jira credentials, so guests never fall
  // back to them (see guest-data-isolation design doc) — and since guests
  // have no persisted settings row either, this makes Jira filing require
  // signing in for them, full stop.
  const user = getUser(req);
  const isGuest = !!user?.is_guest;
  const settings = user ? await getUserSettings(user.id) : null;

  const email = settings?.jira_email || (isGuest ? undefined : process.env.JIRA_EMAIL);
  const apiToken = settings?.jira_api_token || (isGuest ? undefined : process.env.JIRA_API_TOKEN);

  // Settings stores a hostname or a pasted Jira URL (e.g. a board link);
  // env var stores just the subdomain (e.g. "myco") for backwards compat.
  const rawDomain = settings?.jira_domain || (isGuest ? undefined : process.env.JIRA_DOMAIN);
  const domain = rawDomain
    ? rawDomain.includes(".")
      ? normalizeJiraDomain(rawDomain)
      : `${rawDomain}.atlassian.net` // legacy subdomain-only env var
    : null;

  if (!email || !apiToken || !domain) {
    return res.status(503).json({
      error: isGuest
        ? "Sign in to file Jira tickets."
        : "Jira not configured. Add your Jira Domain, Account Email, and API Token in Settings → Jira Cloud Integration.",
    });
  }

  // If no key was typed, try to recover it from a pasted project/board URL
  // (e.g. ".../jira/software/projects/SCRUM/boards/1" -> "SCRUM").
  const resolvedProjectKey =
    projectKey?.trim() || (rawDomain ? extractProjectKeyFromUrl(rawDomain) : null);

  if (!resolvedProjectKey) {
    return res.status(400).json({ error: "'projectKey' is required" });
  }
  if (!title?.trim()) {
    return res.status(400).json({ error: "'title' is required" });
  }

  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");

  try {
    const issueType = await resolveJiraIssueType(domain, resolvedProjectKey, credentials);

    const response = await fetch(
      `https://${domain}/rest/api/3/issue`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            project: { key: resolvedProjectKey.toUpperCase() },
            summary: title.trim(),
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: description ?? "" }],
                },
              ],
            },
            issuetype: issueType.id ? { id: issueType.id } : { name: issueType.name },
          },
        }),
      }
    );

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        data.errors
          ? JSON.stringify(data.errors)
          : ((data.message ?? data.errorMessages) as string | undefined) ??
            "Jira API error";
      return res.status(response.status).json({ error: errMsg });
    }

    const issueKey = data.key as string;
    return res.json({
      success: true,
      issueUrl: `https://${domain}/browse/${issueKey}`,
      issueKey,
    });
  } catch (err: unknown) {
    sendError(res, req, err, { safeMessage: "Failed to create Jira ticket. Please try again." });
  }
});

export default router;
