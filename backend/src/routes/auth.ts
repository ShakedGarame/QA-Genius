import { Router, Request, Response, NextFunction } from "express";
import passport from "../passportConfig.js";
import { getOrCreateGuestUser, getUserSettings, upsertUserSettings } from "../db.js";
import type { DbUser } from "../db.js";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

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

router.get("/api/me", async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

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
  });
});

// ─── User settings (/api/me/settings) ────────────────────────────────────────

router.get("/api/me/settings", async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const settings = await getUserSettings(user.id);
  const mask = (key: string | null) => (key ? `${key.slice(0, 6)}${"•".repeat(20)}` : null);

  res.json({
    openai_api_key: mask(settings?.openai_api_key ?? null),
    anthropic_api_key: mask(settings?.anthropic_api_key ?? null),
    coralogix_api_key: mask(settings?.coralogix_api_key ?? null),
    coralogix_team_name: settings?.coralogix_team_name ?? null,
    coralogix_region: settings?.coralogix_region ?? "EU",
    tests_output_dir: settings?.tests_output_dir ?? null,
    // Whether backend env provides AI without user needing to enter a key
    env_has_openai: !!process.env.OPENAI_API_KEY,
    env_has_anthropic: !!process.env.ANTHROPIC_API_KEY,
    env_has_coralogix: !!process.env.CORALOGIX_API_KEY,
  });
});

router.put("/api/me/settings", async (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const {
    openai_api_key,
    anthropic_api_key,
    coralogix_api_key,
    coralogix_team_name,
    coralogix_region,
    tests_output_dir,
  } = req.body as Record<string, string | undefined>;

  // Only update keys explicitly sent by the client — omitting a field must not wipe stored secrets.
  await upsertUserSettings(user.id, {
    ...(openai_api_key !== undefined ? { openai: openai_api_key?.trim() || null } : {}),
    ...(anthropic_api_key !== undefined ? { anthropic: anthropic_api_key?.trim() || null } : {}),
    ...(coralogix_api_key !== undefined ? { coralogix: coralogix_api_key?.trim() || null } : {}),
    ...(coralogix_team_name !== undefined ? { coralogixTeamName: coralogix_team_name?.trim() || null } : {}),
    ...(coralogix_region !== undefined ? { coralogixRegion: coralogix_region?.trim() || null } : {}),
    ...(tests_output_dir !== undefined ? { testsOutputDir: tests_output_dir?.trim() || null } : {}),
  });

  res.json({ success: true });
});

export default router;
