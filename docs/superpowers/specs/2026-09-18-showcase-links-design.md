# Public Showcase Links

**Status:** Shipped 2026-09-18.

## Problem

QA-Genius is a portfolio piece — its audience is recruiters and hiring managers, not
just the owner. Everything it generates (STDs, Playwright tests, run results) lives
behind login. To see any of it, a visitor has to open the app, click "Continue as
Guest," upload a PRD, and wait for generation — too much friction for someone
skimming a resume link. There was no way to hand someone a direct link to a specific,
already-generated example.

## Design

A `ShowcaseLink` is a public, no-login "case study" view onto one artifact the owner
chose to publish. v1 supports one artifact type: a Manual STD (`ManualStd`).

- **Snapshot, not live join.** Publishing copies the STD's content
  (`featureName`/`domain`/`testCases`/`coverage`/`model`/`isMock`) into the
  `ShowcaseLink.snapshot` JSON column at publish time. The public read never joins
  back to the live `ManualStd` row — editing or deleting the original afterwards
  can't change or break an already-shared link, and there's no live-data sanitization
  to get right on every request.
- **Slug, not the record's real id**, is the public identifier (`randomBytes(9)`,
  base64url) — avoids exposing/enumerating internal DB ids.
- **Owner-only, non-guest.** Guests have no persisted `ManualStd` rows to publish
  from (see the guest-data-isolation design), so publishing requires a real signed-in
  user; the guest case fails with a clear 403 rather than a confusing 404.
- **Revocable, not deletable.** `DELETE /api/showcase/:id` sets `revokedAt` rather
  than removing the row, so the owner keeps a history of what they've shared.

### API

- `GET /api/showcase/:slug` — public, mounted before the `requireAuth` gate (same
  pattern as `authRouter`). 404 for an unknown or revoked slug. Increments `viewCount`.
- `POST /api/showcase` `{ artifactType: "manual_std", sourceId }` — owner-only,
  inside the existing protected router.
- `GET /api/showcase` — list the owner's own links (including revoked, for history).
- `DELETE /api/showcase/:id` — revoke.

### Frontend

- `react-router-dom` was already a dependency but unused — `App.tsx` now wraps
  everything in `BrowserRouter`/`Routes`: `/showcase/:slug` renders the new public
  `ShowcasePage` (no auth check at all, so `useAuth()` never fires for a visitor);
  every other path falls through to the existing `AuthGate` (the old `App.tsx` body,
  unchanged). Vercel's existing SPA catch-all rewrite already sends any non-API path
  to `index.html`, so no deployment config changes were needed.
- `ShowcasePage` reuses `ManualStdTable` as-is (it was already a pure, read-only
  component) — CSV/PDF export come along for free.
- `ShowcaseModal` (triggered by a new Share icon on `ManualStdHistoryCard`) publishes
  on open and shows a copy-to-clipboard link + revoke action.

### A bug found during local testing

The publish `useEffect` fired its `POST /api/showcase` twice under React
StrictMode's dev-only double-invoke — the `cancelled` flag it used only gated the
resulting `setState`, not the in-flight request, so two real (non-idempotent) links
got created for one click. Fixed with a `useRef` guard (`hasFiredRef`) that survives
the double-invoke since the ref is tied to the fiber, not recreated by it.

## Out of scope (v1)

- Showcasing a `Feature`/`GeneratedTest`/`TestRun` (PRD → generated Playwright code →
  execution result) — the flashier demo, but more to snapshot cleanly. Left for a
  follow-up if it's wanted; the `artifactType` field is already generic.
- A dedicated "manage my showcase links" screen — v1 only exposes publish + revoke
  inline from the STD card that created the link.
