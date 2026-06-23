import passport from "passport";
import { Strategy as GitHubStrategy, Profile as GitHubProfile } from "passport-github2";
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from "passport-google-oauth20";
import { VerifyCallback } from "passport-oauth2";
import { findUserById, upsertGithubUser, upsertGoogleUser } from "./db.js";

passport.serializeUser((user, done) => {
  done(null, (user as { id: string }).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await findUserById(id);
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/auth/github/callback`,
        scope: ["user:email"],
      },
      async (_accessToken: string, _refreshToken: string, profile: GitHubProfile, done: VerifyCallback) => {
        try {
          const email = profile.emails?.[0]?.value ?? null;
          const user = await upsertGithubUser({
            githubId: profile.id,
            email,
            name: profile.displayName ?? profile.username ?? "GitHub User",
            avatarUrl: profile.photos?.[0]?.value ?? null,
          });
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
} else {
  console.warn("[auth] GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET missing — GitHub login disabled");
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/auth/google/callback`,
        scope: ["profile", "email"],
      },
      async (_accessToken: string, _refreshToken: string, profile: GoogleProfile, done: VerifyCallback) => {
        try {
          const email = profile.emails?.[0]?.value ?? null;
          const user = await upsertGoogleUser({
            googleId: profile.id,
            email,
            name: profile.displayName ?? "Google User",
            avatarUrl: profile.photos?.[0]?.value ?? null,
          });
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
} else {
  console.warn("[auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing — Google login disabled");
}

export default passport;
