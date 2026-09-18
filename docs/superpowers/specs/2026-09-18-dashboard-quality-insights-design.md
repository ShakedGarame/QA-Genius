# Dashboard Quality Insights: Real Healing Speed + Flaky Test Detection

**Status:** Shipped 2026-09-18.

## Problem

The Dashboard already had solid basics (pass rate, run totals, a 14-day pass/fail
trend chart, a sortable recent-runs table). Two things stood out as gaps:

1. The "Avg Healing Speed" metric card was permanently `N/A` with a comment in the
   code admitting why: *"Self-Heal duration isn't tracked yet — needs backend
   instrumentation."* Self-Heal (AI-fixes-a-failing-test) is one of the app's
   flagship AI features but had zero observability of its own.
2. Pass/fail is tracked in aggregate, but nothing surfaces the QA-specific signal
   that matters most operationally: a test that passes sometimes and fails other
   times on the *same file* (flaky), as distinct from a test that failed once and
   was fixed.

## Design

### Real healing speed (`SelfHealEvent`)

- New `SelfHealEvent` model: `userId`, `featureSlug?`, `fileName?`, `durationMs`,
  `isMock`, `createdAt`.
- `POST /api/tests/self-heal` (`backend/src/routes/tests.ts`) now times the
  `selfHealTest()` call and records an event afterwards — fire-and-forget
  (`.catch(console.error)`), so a slow/failed analytics write never delays or
  breaks the actual self-heal response.
- Guarded by `!user.is_guest`: a virtual public guest has no row in `users`, so a
  guest FK write would throw. Same reasoning as every other guest-isolation guard
  in this codebase — the Dashboard is an owner-account feature already.
- `getSelfHealStats(userId)` returns `{ averageDurationMs, count, mockCount }` —
  `averageDurationMs: null` (not `0`) when `count === 0`, so the UI can render
  "N/A" instead of a misleading "0s".

### Flaky test detection (no schema change)

- `getFlakyTests(userId)` samples the most recent 300 completed (`PASSED`/
  `FAILED`) `TestRun` rows, groups them by `testFileId` (falling back to
  `featureName::testFileName` for older rows without one), and flags any group
  with *both* a pass and a fail in that window. Sampling the recent window (not
  all-time) means a flake that was fixed long ago eventually ages out instead of
  haunting the list forever.
- Returns the top 5, ranked by `min(passed, failed)` — a test that's split
  close to 50/50 is a stronger, more current flake signal than one with a single
  old failure buried under 50 later passes.
- Both additions are folded into the existing `getTestRunDashboardStats()`
  aggregate (same `Promise.all` it already used) rather than new endpoints —
  `GET /api/test-runs/stats` already returns one dashboard payload.

### Frontend

- `DashboardTab.tsx`: the healing-speed `MetricCard` now renders
  `formatDuration(stats.selfHeal.averageDurationMs)` with a real "Based on N
  Self-Heal attempts" hint (falls back to a call-to-action hint at zero, not just
  "N/A").
- New "Flakiest Tests" panel below the Pass/Fail Trend chart: a small two-segment
  ratio bar (`PassFailRatioBar`) per flaky file, reusing the exact emerald/red
  pass/fail colors `PassFailTrendChart` already established directly above it —
  no new palette introduced, consistent with the dataviz skill's "color follows
  the entity" rule. A "Last: PASSED/FAILED" badge plus the literal `passed/total`
  count means the read never depends on color alone. Empty state is a positive
  "No flaky tests detected" message, not a bare empty panel.

## Verified locally

Simulated a 2-passed/1-failed run history for one feature via `POST`/`PATCH
/api/test-runs`, and one `POST /api/tests/self-heal` call, confirmed
`GET /api/test-runs/stats` returned both `selfHeal` and `flakyTests` correctly,
and screenshotted the rendered Dashboard. Test data was deleted afterward (no
`DELETE /api/test-runs` route exists — runs are treated as permanent history — so
cleanup went through a one-off Prisma script instead, since this local dev session
is connected to the same Supabase database as production).

## Out of scope

- A duration/speed trend chart (only counts are trended today) — could reuse the
  same day-bucketing helper `PassFailTrendChart` already has, if wanted later.
- Per-feature flakiness breakdown beyond the top-5 leaderboard.
