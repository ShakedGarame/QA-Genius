# Showcase Links, Part 2: Generated Playwright Tests

**Status:** Shipped 2026-09-18. Follow-up to `2026-09-18-showcase-links-design.md`,
which explicitly scoped this out of v1 for time.

## Note on the 4th improvement this session

The plan going in was to build GitHub Actions CI integration as the 4th feature.
Investigating turned up that it already exists in full — `.github/workflows/
playwright.yml`, workflow-dispatch/poll/logs/artifacts routes in
`backend/src/routes/run.ts`, and 574 lines of client-side polling/log-fetching in
`frontend/src/lib/cloudRunner.ts`. Building it would have duplicated a feature
that already works well, so this is a pivot to the other deferred piece of
Showcase Links instead: the "flashier" artifact type called out as out-of-scope in
part 1 (PRD → AI-generated Playwright code → execution result), which reuses all
the `ShowcaseLink` infrastructure already in place.

## Design

Extends the `ShowcaseLink.artifactType` from `"manual_std"` (part 1) to also
accept `"feature_test"`, reusing the exact same model, public route, and
revoke flow — nothing about the public-facing plumbing had to change.

- `ShowcaseFeatureTestSnapshot`: `{ featureName, description, prdText, inputType,
  fileName, code, latestRun: { status, durationMs, ranAt } | null }`. `latestRun`
  is looked up by `testFileId` (falling back to `relativePath` match) at publish
  time and is `null` if the test has never been executed — the public page shows
  "Not yet executed" rather than hiding the badge.
- `createFeatureTestShowcase(userId, featureSlug, fileName)` (`backend/src/db.ts`)
  loads the `Feature` + its matching `GeneratedTest` row, snapshots them the same
  way `createManualStdShowcase` does, and returns `null` (→ 404) if the file
  doesn't belong to that user rather than throwing.
- `POST /api/showcase` now branches on `artifactType`: `"manual_std"` takes
  `{ sourceId }` (unchanged from part 1); `"feature_test"` takes
  `{ featureSlug, fileName }` instead, since the frontend's `TestFileInfo` never
  carries the underlying `GeneratedTest.id`.
- `ShowcaseModal` was generalized from a `std`-only prop to a
  `publish: { artifactType: "manual_std"; sourceId } | { artifactType:
  "feature_test"; featureSlug; fileName }` union, so both `HistoryTab` (STDs) and
  `TestRepositoryTab` (generated test files, guarded by `!isMock` — sample rows
  have no real DB id to publish) can drive the same modal.
- `ShowcasePage` narrows `view.snapshot`'s union via an `"code" in snapshot` /
  `"testCases" in snapshot` property check (the two snapshot shapes don't share a
  discriminant field) and renders a `FeatureTestShowcase` view: input-type badge,
  a PASSED/FAILED/"Not yet executed" run badge, the source PRD text, and the
  generated code in the same `<pre>` convention `CodeModal` already uses
  elsewhere in the app — no new code-display component introduced.

## Verified locally

Generated a real feature+test via `POST /api/generate-tests`, published a
`feature_test` showcase both directly via `curl` and through the actual Share
button in Test Repository (Playwright, headless), confirmed the public page
renders the PRD/badge/code with zero console errors, then purged all test
showcase links, the generated test, and the feature via a one-off Prisma script
(same reasoning as part 1 — local dev shares the production Supabase database and
there's no bulk-delete API for this).
