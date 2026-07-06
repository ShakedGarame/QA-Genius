import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import passport from "../passportConfig.js";
import { getOrCreateGuestUser, getOrCreateAdminUser, getUserSettings, upsertUserSettings } from "../db.js";
import type { DbUser } from "../db.js";
import { ensureDbUser } from "../middleware/ensureDbUser.js";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

// ─── Admin login rate limiting (per-IP, in-memory) ───────────────────────────
// Best-effort brute-force guard — resets on cold start, but Fluid Compute
// reuses warm instances so it still throttles sustained attack traffic.
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 8;
const adminLoginAttempts = new Map<string, { count: number; firstAttempt: number }>();

function isAdminLoginRateLimited(key: string): boolean {
  const entry = adminLoginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > ADMIN_LOGIN_WINDOW_MS) {
    adminLoginAttempts.delete(key);
    return false;
  }
  return entry.count >= ADMIN_LOGIN_MAX_ATTEMPTS;
}

function recordFailedAdminLogin(key: string): void {
  const entry = adminLoginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAttempt > ADMIN_LOGIN_WINDOW_MS) {
    adminLoginAttempts.set(key, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function getUser(req: Request): DbUser | null {
  return (req.user as DbUser) ?? null;
}

// ─── Auth providers status (public) ──────────────────────────────────────────

router.get("/api/auth/providers", (_req: Request, res: Response) => {
  res.json({
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

// ─── Mock / portfolio login (always available) ────────────────────────────────
// Creates a deterministic "Guest Developer" session — no OAuth credentials needed.
// Safe in production: users share the same mock_user_123 sandbox, which is ideal
// for portfolio demos (visitors see the same pre-generated data).

router.post("/api/auth/mock-login", async (req: Request, res: Response) => {
  try {
    const guestUser = await getOrCreateGuestUser();

    req.login(guestUser, (err) => {
      if (err) return res.status(500).json({ error: "Login failed" });
      res.json({
        success: true,
        user: { id: guestUser.id, name: guestUser.name, email: guestUser.email },
      });
    });
  } catch (err) {
    console.error("[mock-login]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── Owner / admin login (email + password against env-configured hash) ──────
// Separate from the shared guest account — grants a private, fully-editable
// settings record. Requires ADMIN_EMAIL + ADMIN_PASSWORD_HASH to be set.

router.post("/api/auth/admin-login", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  if (isAdminLoginRateLimited(ip)) {
    return res.status(429).json({ error: "Too many attempts. Please try again later." });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminEmail || !adminPasswordHash) {
    return res.status(503).json({ error: "Admin login is not configured on this server." });
  }

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const emailMatches = email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
  const passwordMatches = await bcrypt.compare(password, adminPasswordHash);

  if (!emailMatches || !passwordMatches) {
    recordFailedAdminLogin(ip);
    return res.status(401).json({ error: "Invalid email or password." });
  }
  adminLoginAttempts.delete(ip);

  try {
    const adminUser = await getOrCreateAdminUser(adminEmail, process.env.ADMIN_NAME?.trim() || "Admin");
    req.login(adminUser, (err) => {
      if (err) return res.status(500).json({ error: "Login failed" });
      res.json({
        success: true,
        user: { id: adminUser.id, name: adminUser.name, email: adminUser.email },
      });
    });
  } catch (err) {
    console.error("[admin-login]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── GitHub OAuth flow ────────────────────────────────────────────────────────

router.get("/auth/github", (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_URL}?error=github_not_configured`);
  }
  passport.authenticate("github", { scope: ["user:email"] })(req, res, next);
});

router.get(
  "/auth/github/callback",
  (req: Request, res: Response, next: NextFunction) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.redirect(`${FRONTEND_URL}?error=github_not_configured`);
    }
    passport.authenticate("github", { failureRedirect: `${FRONTEND_URL}?error=github` })(req, res, next);
  },
  (_req: Request, res: Response) => res.redirect(FRONTEND_URL)
);

// ─── Google OAuth flow ────────────────────────────────────────────────────────

router.get("/auth/google", (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_URL}?error=google_not_configured`);
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get(
  "/auth/google/callback",
  (req: Request, res: Response, next: NextFunction) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${FRONTEND_URL}?error=google_not_configured`);
    }
    passport.authenticate("google", { failureRedirect: `${FRONTEND_URL}?error=google` })(req, res, next);
  },
  (_req: Request, res: Response) => res.redirect(FRONTEND_URL)
);

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post("/auth/logout", (req: Request, res: Response, next: NextFunction) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("qagenius.sid");
      res.json({ success: true });
    });
  });
});

// ─── Current user (/api/me) ───────────────────────────────────────────────────

router.get("/api/me", ensureDbUser, async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  try {
    const settings = await getUserSettings(user.id);
    const hasEnvOpenAI = !!process.env.OPENAI_API_KEY;

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      hasOpenAI: !!(settings?.openai_api_key) || hasEnvOpenAI,
      hasEnvOpenAI,
      hasAnthropic: !!(settings?.anthropic_api_key) || !!process.env.ANTHROPIC_API_KEY,
      hasCoralogix: !!(settings?.coralogix_api_key),
      hasEnvGitHubPat: !!process.env.GITHUB_ACTIONS_PAT,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load account" });
  }
});

// ─── User settings (/api/me/settings) ────────────────────────────────────────

router.get("/api/me/settings", ensureDbUser, async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  try {
    const settings = await getUserSettings(user.id);
    // Never leak any real characters to the client — a fixed-length placeholder
    // only signals "configured", it must not help narrow down the real secret.
    const mask = (key: string | null) => (key ? "•".repeat(20) : null);

    res.json({
      openai_api_key: mask(settings?.openai_api_key ?? null),
      anthropic_api_key: mask(settings?.anthropic_api_key ?? null),
      coralogix_api_key: mask(settings?.coralogix_api_key ?? null),
      coralogix_team_name: settings?.coralogix_team_name ?? null,
      coralogix_region: settings?.coralogix_region ?? "EU",
      tests_output_dir: settings?.tests_output_dir ?? null,
      github_issues_repo: settings?.github_issues_repo ?? null,
      jira_domain: settings?.jira_domain ?? null,
      jira_email: settings?.jira_email ?? null,
      jira_api_token: mask(settings?.jira_api_token ?? null),
      // Whether backend env provides AI without user needing to enter a key
      env_has_openai: !!process.env.OPENAI_API_KEY,
      env_has_anthropic: !!process.env.ANTHROPIC_API_KEY,
      env_has_coralogix: !!process.env.CORALOGIX_API_KEY,
      env_has_github_pat: !!process.env.GITHUB_ACTIONS_PAT,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load settings" });
  }
});

router.put("/api/me/settings", ensureDbUser, async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const {
    openai_api_key,
    anthropic_api_key,
    coralogix_api_key,
    coralogix_team_name,
    coralogix_region,
    tests_output_dir,
    github_issues_repo,
    jira_domain,
    jira_email,
    jira_api_token,
  } = req.body as Record<string, string | undefined>;

  try {
    // Only update keys explicitly sent by the client — omitting a field must not wipe stored secrets.
    await upsertUserSettings(user.id, {
      ...(openai_api_key !== undefined ? { openai: openai_api_key?.trim() || null } : {}),
      ...(anthropic_api_key !== undefined ? { anthropic: anthropic_api_key?.trim() || null } : {}),
      ...(coralogix_api_key !== undefined ? { coralogix: coralogix_api_key?.trim() || null } : {}),
      ...(coralogix_team_name !== undefined ? { coralogixTeamName: coralogix_team_name?.trim() || null } : {}),
      ...(coralogix_region !== undefined ? { coralogixRegion: coralogix_region?.trim() || null } : {}),
      ...(tests_output_dir !== undefined ? { testsOutputDir: tests_output_dir?.trim() || null } : {}),
      ...(github_issues_repo !== undefined ? { githubIssuesRepo: github_issues_repo?.trim() || null } : {}),
      ...(jira_domain !== undefined ? { jiraDomain: jira_domain?.trim() || null } : {}),
      ...(jira_email !== undefined ? { jiraEmail: jira_email?.trim() || null } : {}),
      ...(jira_api_token !== undefined && !jira_api_token.includes("•")
        ? { jiraApiToken: jira_api_token?.trim() || null }
        : {}),
    });

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save settings" });
  }
});

export default router;
