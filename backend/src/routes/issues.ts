import { Router, Request, Response } from "express";
import { getUserSettings } from "../db.js";
import type { DbUser } from "../db.js";

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

  // Header token (user's stored PAT) takes priority, then user settings, then server env.
  const token =
    (req.headers["x-github-token"] as string | undefined) ||
    (req.headers["x-user-github-token"] as string | undefined) ||
    process.env.GITHUB_ISSUES_TOKEN ||
    process.env.GITHUB_TOKEN;

  // Repo: user settings win over env var (enables per-user targeting).
  const user = getUser(req);
  const settings = user ? await getUserSettings(user.id) : null;
  const rawRepo = settings?.github_issues_repo || process.env.GITHUB_ISSUES_REPO;
  const repo = rawRepo ? normalizeGithubRepo(rawRepo) : rawRepo;

  if (!token) {
    return res.status(503).json({
      error:
        "GitHub token not configured. Set GITHUB_ISSUES_TOKEN in your environment, or add a GitHub PAT in Settings.",
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
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Failed to create GitHub issue" });
  }
});

// POST /api/issues/jira/create
router.post("/issues/jira/create", async (req: Request, res: Response) => {
  const { title, description, projectKey } = req.body as {
    title: string;
    description?: string;
    projectKey: string;
  };

  // User settings take priority over env vars for Jira credentials.
  const user = getUser(req);
  const settings = user ? await getUserSettings(user.id) : null;

  const email = settings?.jira_email || process.env.JIRA_EMAIL;
  const apiToken = settings?.jira_api_token || process.env.JIRA_API_TOKEN;

  // Settings stores the full hostname (e.g. "myco.atlassian.net");
  // env var stores just the subdomain (e.g. "myco") for backwards compat.
  const rawDomain = settings?.jira_domain || process.env.JIRA_DOMAIN;
  const domain = rawDomain
    ? rawDomain.includes(".")
      ? rawDomain           // full hostname from settings
      : `${rawDomain}.atlassian.net` // legacy subdomain-only env var
    : null;

  if (!email || !apiToken || !domain) {
    return res.status(503).json({
      error:
        "Jira not configured. Add your Jira Domain, Account Email, and API Token in Settings → Jira Cloud Integration.",
    });
  }
  if (!projectKey?.trim()) {
    return res.status(400).json({ error: "'projectKey' is required" });
  }
  if (!title?.trim()) {
    return res.status(400).json({ error: "'title' is required" });
  }

  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");

  try {
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
            project: { key: projectKey.trim().toUpperCase() },
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
            issuetype: { name: "Bug" },
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
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Failed to create Jira ticket" });
  }
});

export default router;
