# Guest Data Isolation — Design (v3)

## Problem

Every anonymous visitor ("Continue as Guest") is upserted onto a single shared
`User` row (`githubId: "mock_user_123"`, `backend/src/db.ts:134-149`, created
via `POST /api/auth/mock-login`, `backend/src/routes/auth.ts:59-87`). Because
`UserSettings` is 1-to-1 per user, any API key, Jira token, or GitHub token one
guest types into Settings is persisted onto that shared row and becomes
visible/usable to every other guest. The same shared row is also, today,
what local-dev auto-login (`autoLocalGuest.ts`) resolves to — so local
development already writes into the exact row this fix cleans up.

Confirmed current state of the shared guest row (read via a one-off Prisma
script, 2026-09-15): 41 `Feature`, 10 `ManualStd`, 94 `LogAnalysis`, 132
`TestRun` rows, and a `UserSettings` row with a live OpenAI key set.

## Goals

1. Anonymous visitors keep today's one-click "Continue as Guest" flow and can
   run real generations (Test Generator / Manual STD Generator / Log
   Analyzer), but nothing they generate or configure is persisted
   server-side, and no two guests ever share state.
2. Saving anything durable (settings, API keys, generated artifacts) requires
   a real login (existing Admin email+password, or Google OAuth once
   configured).
3. No data is deleted. The 41/10/94/132 rows currently on the shared guest
   row, plus its `UserSettings`, are reassigned to the site owner's own
   account rather than discarded.
4. Logging in via Google with the owner's email resolves to the same account
   as the existing Admin login (same email), not a duplicate identity.
5. Local development keeps behaving as it does today — a stable, DB-backed
   "Guest Developer" identity whose generated data persists across restarts
   — but as its own private identity, not the public shared row.
6. Guests can never trigger the owner's own Jira/GitHub-issue-filing
   credentials, even where those are configured via environment variables
   rather than the shared `UserSettings` row (owner's explicit choice: block
   entirely for guests, prompt login instead).

## Non-goals

- Multi-tenant support for third-party signed-in users beyond what OAuth
  already provides.
- Automating Google Cloud OAuth credential creation — requires the account
  owner to act in the Google Cloud Console UI; out of scope for any agent.
- Changing the OpenAI/Anthropic env-key fallback or the GitHub Actions PAT
  fallback available to guests — those are already documented,
  intentionally-shared demo credentials (see `.env.example`:
  "set on Vercel for all visitors") and stay available to guests. Only
  Jira / GitHub-issue-filing / Coralogix env fallbacks are newly blocked for
  guests (goal 6).

## Design

### 1. Three distinct identities, not two

- **Public anonymous guest** (new): a virtual, non-DB-backed identity, unique
  per browser, created by `POST /api/auth/mock-login` when a visitor clicks
  "Continue as Guest" on the deployed site.
- **Local-dev guest** (unchanged behavior, new dedicated row): a single fixed,
  DB-backed identity used only by `autoLocalGuest.ts` on localhost, kept
  separate from the public guest mechanism so a developer's local
  Feature/History/Settings keep persisting across restarts exactly as today.
  Gets its own fixed row (e.g. `githubId: "local_dev_guest"`) instead of
  reusing `mock_user_123`.
- **Real accounts** (unchanged): Admin (email+password) and, once configured,
  Google OAuth — both already privately isolated.

### 2. Public guest = virtual identity via the existing sentinel pattern, generalized

The codebase already has the right pattern for this, just applied to one
fixed, shared value instead of a per-visitor one. `buildLocalDevGuest()`
(`db.ts:121`) returns a sentinel user object; `deserializeUser`
(`passportConfig.ts:19-21`) recognizes that one fixed id and reconstructs it
**without touching the database**; `ensureDbUser`
(`middleware/ensureDbUser.ts:19`) skips DB reconciliation for anything that
isn't that fixed id.

The fix generalizes this from "one shared sentinel" to "one sentinel per
anonymous visitor," while leaving the *existing* local-dev sentinel id
untouched (renaming it would silently log out any live local-dev session):

- `DbUser` (`db.ts:18-27`) gains an optional `isGuest?: boolean` field;
  `mapUser` (`db.ts:69-78`) and every other place that checks
  `sessionUser.id === buildLocalDevGuest().id` (`ensureDbUser.ts:19`,
  `db.ts:171-172`, `db.ts:178-180`, `db.ts:200`, `db.ts:254`) is updated to
  check `isGuest` instead of that one exact id, generically covering both
  guest kinds.
- A new id namespace, `guest:<random-id>`, is introduced for **public**
  guests only. The existing local-dev sentinel keeps its current id
  unchanged. `deserializeUser` recognizes *either* the unchanged local-dev id
  *or* the `guest:` prefix and reconstructs the virtual object without a DB
  round-trip.
- `POST /api/auth/mock-login` stops calling `getOrCreateGuestUser()` (the
  real DB upsert) for public visitors. It generates a fresh `guest:<random-id>`
  once per browser and `req.login()`s the virtual object built from it — a
  real Passport session, so `requireAuth` needs **no change**.
- The stateless safety-net cookie (`lib/guestToken.ts`,
  `middleware/guestSession.ts:26-27`) — today a fixed HMAC token shared by
  every guest — is changed to carry the per-browser `guest:<random-id>`
  itself (HMAC-signed with `SESSION_SECRET` so it can't be forged), and the
  fallback in `guestSession.ts` rebuilds the virtual object from *that*
  specific id rather than the old fixed sentinel, preserving the "guest
  access survives a session-store outage" property without reintroducing a
  shared identity.
- `autoLocalGuest.ts` is updated to build/attach the separate local-dev row
  (goal 5) — its own one-time `getOrCreate`, independent of both the old
  shared row and the new public-guest mechanism.

### 3. Five call sites need an explicit guest branch (not four)

A `req.user.id` in the `guest:` namespace never corresponds to a `User` row,
so any FK-backed write must be skipped explicitly:

- `routes/generate.ts` — **two** branches: Swagger (`:96-97`) and PRD
  (`:131-132`).
- `routes/generateStd.ts` — `ManualStd.create`.
- `routes/analyze.ts` — **two** call sites: `:112` and `:183`
  (`routes/logAnalyses.ts` is list/get/delete only, not a persistence site).
- `routes/run.ts:317` — `TestRun.create`. Its returned `id` is read
  downstream at `:324`, `:327`, `:350` (SSE progress, polling), so the guest
  branch cannot simply skip the write — it must synthesize an in-memory
  `randomUUID()` to stand in for `dbRun.id` so the rest of the run flow
  works unmodified.
- `routes/testRuns.ts:61` (`POST /api/test-runs` → `createTestRun`) — missed
  in the first pass of this design. Its catch block at `:72` currently
  echoes `err.message` straight to the client — the same raw-Prisma-leak
  pattern this whole investigation started from — so this site doubles as a
  small instance of improvement #2 from the earlier review (centralized
  error handling), independent of the guest fix.

All five get the same shape: `if (req.user.isGuest) { return
res.json(<result, without a persisted id or with a synthesized one>); }`.

### 4. Guest API keys are already request-scoped — fix the guest predicate, not the mechanism

`resolveOpenAIKeySource` (`backend/src/lib/requestKeys.ts:42-66`) already
resolves a per-request key (body → header → DB → none) without requiring a
persisted `UserSettings` row. What's wrong is the *frontend's* guest
detection: `SettingsTab.tsx:177` string-matches
`user?.email?.toLowerCase() === GUEST_EMAIL` (the old shared account's fixed
email). Under the new virtual identity, `email` is `null` for every guest, so
this becomes `const isGuest = !user?.email;` — correct for all three real
login paths (always a real email) and both guest kinds (never one).

`PUT /api/me/settings` additionally gets a defense-in-depth guard
(`if (req.user.isGuest) return res.status(403)...`) so a guest can never
reach the FK-violation path even if a frontend check is ever bypassed.

### 5. Guests are blocked from Jira / GitHub-issue-filing / Coralogix entirely (owner's decision)

Per explicit product decision: it's not enough that a guest's own
`UserSettings` lookup returns null (`getUserSettings`, `db.ts:253-261`,
confirmed to fail closed / return `null` rather than throw). The
*environment-variable* fallbacks for these three integrations —
`routes/issues.ts:153-158` (`JIRA_*`), `routes/issues.ts:33,38`
(`GITHUB_TOKEN`/`GITHUB_ISSUES_REPO`), `lib/coralogix.ts:96`, and the
Coralogix-test endpoint at `auth.ts:208-210` — are gated behind an explicit
`if (req.user.isGuest) return res.status(403/503, "Sign in to use this
feature")` before any env fallback is consulted, rather than letting a guest
silently use the owner's own personal tokens. This does **not** apply to the
OpenAI/Anthropic key env fallback or the GitHub Actions PAT (cloud test
runner) — those remain available to guests by design (see Non-goals).

### 6. Save/login prompts

Any explicit "save to Test Repository / History" action while `isGuest` is
true opens a small modal prompting sign-in (Admin or Google) — the existing
one-click "Continue as Guest" flow on the login screen is untouched.

### 7. Account-linking fix (prerequisite for goal 4) — Google only, verified email only

`upsertGoogleUser` (`db.ts`) gains a fallback: if no row matches `googleId`,
look up an existing row by case-insensitive email match, but only when:

- The Google profile's email is verified — confirmed real:
  `@types/passport-google-oauth20` declares `verified: boolean` on each
  entry in `profile.emails`, populated from Google's `email_verified` at
  runtime. Require `profile.emails[0].verified === true`.
- Restricted to Google only — **never** applied to `upsertGithubUser`.
  GitHub profile emails are not verified (`passportConfig.ts:46` takes
  `profile.emails?.[0]?.value` with no check), so allowing this fallback
  there would let anyone register a GitHub account whose email string
  equals `ADMIN_EMAIL` and silently take over `admin_owner`.
- The matched row's `googleId` is currently `null` — never overwrites an
  existing different `googleId` (no silent re-linking).
- Never matches either guest kind (neither has a real email).

This makes signing in with Google using `shakedg212@gmail.com` resolve to
the existing `admin_owner` row instead of creating a duplicate identity.

`resolveDbUser`'s current final fallback — silently resurrecting a broken
real-user session as the shared guest (`db.ts:200`) — is changed to fail
closed (force re-authentication), since there's no longer a meaningful
shared identity to fall back to.

### 8. One-time data migration (manual trigger, not automatic)

A script under `backend/scripts/`, run once by the owner against production,
wrapped in a single Prisma `$transaction`:

1. Prints counts of rows about to move (41 `Feature`, 10 `ManualStd`, 94
   `LogAnalysis`, 132 `TestRun`, confirmed 2026-09-15 — re-checked
   immediately before running, since data may have changed) and requires an
   explicit `--confirm` flag.
2. **Feature slug collisions**: `@@unique([userId, slug])`
   (`schema.prisma:65`). Confirmed via a one-off check: exactly one collision
   between the guest's 41 features and the owner's 4 (`"engine"`). The
   script renames the guest's colliding slug (suffix `-guest`) before
   reassigning `userId`; `GeneratedTest`'s `@@unique([featureId, fileName])`
   is unaffected since `featureId` itself never changes. No other unique
   constraints exist among `TestRun`/`ManualStd`/`LogAnalysis` (index-only)
   or `UserSettings` (`userId` is `@id`, which is why it's merged, not moved).
3. Reassigns `ManualStd`, `LogAnalysis`, `TestRun` rows from the guest id to
   the owner id via `updateMany` (accepting that Prisma will bump their
   `@updatedAt` timestamps — cosmetic, not worth raw SQL for a one-off demo
   dataset).
4. Merges `UserSettings`: keeps the owner's existing value per secret field
   (owner already has `openaiApiKey` and `jiraApiToken` set), falling back to
   the guest's value only where the owner's is empty. Afterward, nulls out
   every secret column on the guest's `UserSettings` row so the previously-
   exposed OpenAI key doesn't linger in the database.
5. Does not delete the guest `User` row itself. `mock_user_123` becomes a
   purely historical artifact — no new session ever attaches to it again
   after §2.

No automated backup step beyond Supabase's own point-in-time recovery.

### 9. Google OAuth setup

Owner creates an OAuth Client ID in Google Cloud Console (External consent
screen, default email/profile scopes, redirect URIs
`https://qa-genius-app.vercel.app/auth/google/callback` and
`http://localhost:3001/auth/google/callback` — must exactly match
`${BACKEND_URL}/auth/google/callback` per `passportConfig.ts:73`, so
`BACKEND_URL` must be confirmed correct in Vercel's project env vars, not
just locally) and provides `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Added
to `backend/.env` locally and to Vercel's environment variables for
production, then redeploy.

## Testing

- Local: with the new dedicated local-dev identity (§1), `autoLocalGuest`
  continues to persist data across restarts as today — no behavior change
  for the solo-developer workflow.
- Local: test *public*-guest-to-guest isolation with
  `LOCAL_DEV_AUTO_LOGIN=0` and two separate browser profiles independently
  clicking "Continue as Guest," or against a deployed preview URL (where
  auto-login is already disabled).
- Confirm generation still works end-to-end (real LLM call) for a public
  guest without creating any `Feature`/`ManualStd`/`LogAnalysis`/`TestRun`
  row, and that the run/SSE flow still works with a synthesized `TestRun` id.
- Confirm a public guest attempting Jira ticket filing / GitHub issue filing
  / Coralogix queries gets a clean "sign in required" response even when
  those env vars are configured in Vercel.
- Confirm Admin login is unaffected.
- Once Google credentials exist: confirm Google login with the owner's email
  lands on the same account as Admin login, and that an unrelated Google
  account does not.
- Before running the migration script against production, re-run the
  read-only count/collision check to confirm the numbers still match.
