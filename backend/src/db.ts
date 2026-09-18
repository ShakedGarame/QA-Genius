/**
 * PostgreSQL data layer (Supabase) — users, settings, features, tests, log analyses.
 */
import { randomUUID, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import type {
  FeatureGroup,
  FeatureMeta,
  InputType,
  TestFileInfo,
  ManualStdRecord,
  ManualStdTestCase,
  StdCoverageRow,
  StdDomain,
  ShowcaseArtifactType,
  ShowcaseLinkRecord,
  ShowcaseManualStdSnapshot,
  ShowcaseFeatureTestSnapshot,
  ShowcasePublicView,
  SelfHealStats,
  FlakyTestEntry,
} from "./types/index.js";

export interface DbUser {
  id: string;
  github_id: string | null;
  google_id: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
  created_at: string;
  last_login: string;
  /** True only for a virtual, never-persisted public-guest identity (see
   * buildPublicGuest). Absent/false for every real, DB-backed user —
   * including the local-dev guest, which is a real row once resolved. */
  is_guest?: boolean;
}

export interface DbUserSettings {
  user_id: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  coralogix_api_key: string | null;
  coralogix_team_name: string | null;
  coralogix_region: string | null;
  tests_output_dir: string | null;
  github_issues_repo: string | null;
  jira_domain: string | null;
  jira_email: string | null;
  jira_api_token: string | null;
  updated_at: string;
}

export interface DbLogAnalysis {
  id: string;
  user_id: string;
  source: string;
  feature_name: string | null;
  raw_logs: string;
  root_cause: string;
  explanation: string;
  suggested_fix: string;
  severity: string;
  category: string;
  is_mock: boolean;
  created_at: string;
}

function mapUser(row: {
  id: string;
  githubId: string | null;
  googleId: string | null;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  lastLogin: Date;
}): DbUser {
  return {
    id: row.id,
    github_id: row.githubId,
    google_id: row.googleId,
    email: row.email,
    name: row.name,
    avatar_url: row.avatarUrl,
    created_at: row.createdAt.toISOString(),
    last_login: row.lastLogin.toISOString(),
  };
}

function mapSettings(row: {
  userId: string;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  coralogixApiKey: string | null;
  coralogixTeamName: string | null;
  coralogixRegion: string | null;
  testsOutputDir: string | null;
  githubIssuesRepo: string | null;
  jiraDomain: string | null;
  jiraEmail: string | null;
  jiraApiToken: string | null;
  updatedAt: Date;
}): DbUserSettings {
  return {
    user_id: row.userId,
    openai_api_key: row.openaiApiKey,
    anthropic_api_key: row.anthropicApiKey,
    coralogix_api_key: row.coralogixApiKey,
    coralogix_team_name: row.coralogixTeamName,
    coralogix_region: row.coralogixRegion,
    tests_output_dir: row.testsOutputDir,
    github_issues_repo: row.githubIssuesRepo,
    jira_domain: row.jiraDomain,
    jira_email: row.jiraEmail,
    jira_api_token: row.jiraApiToken,
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function findUserById(id: string): Promise<DbUser | undefined> {
  try {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? mapUser(row) : undefined;
  } catch {
    return undefined;
  }
}

/** Sentinel id for the local-dev auto-login placeholder, before it's reconciled
 * to the real local-dev DB row by ensureDbUser/resolveDbUser. Kept unchanged
 * so an existing local session cookie doesn't silently log out. */
const LOCAL_DEV_SENTINEL_ID = "local-dev-guest";

/** Stable in-memory placeholder used before the local-dev identity is
 * reconciled to its real DB row, and as a last-resort fallback if Supabase is
 * genuinely unreachable. */
export function buildLocalDevGuest(): DbUser {
  return {
    id: LOCAL_DEV_SENTINEL_ID,
    github_id: "local_dev_guest",
    google_id: null,
    email: "dev@qa-genius.local",
    name: "Guest Developer",
    avatar_url: "https://avatars.githubusercontent.com/u/0?v=4",
    created_at: new Date().toISOString(),
    last_login: new Date().toISOString(),
  };
}

/** Dedicated local-dev identity — separate from both the historical shared
 * public-guest row and the new stateless public-guest mechanism, so a
 * developer's local Feature/History/Settings keep persisting across restarts
 * exactly as before this fix. */
export async function getOrCreateLocalDevUser(): Promise<DbUser> {
  try {
    return await upsertGithubUser({
      githubId: "local_dev_guest",
      email: "dev@qa-genius.local",
      name: "Guest Developer",
      avatarUrl: "https://avatars.githubusercontent.com/u/0?v=4",
    });
  } catch (err) {
    console.warn(
      "[auth] Supabase unreachable — using offline local-dev guest:",
      err instanceof Error ? err.message : err
    );
    return buildLocalDevGuest();
  }
}

/** Historical shared guest row (githubId "mock_user_123") — no longer written
 * to by any live code path after the guest-data-isolation fix. Kept only so
 * the one-time migration script can look it up. */
export async function getOrCreateGuestUser(): Promise<DbUser> {
  return upsertGithubUser({
    githubId: "mock_user_123",
    email: "guest@qa-genius.com",
    name: "Guest Developer",
    avatarUrl: "https://avatars.githubusercontent.com/u/0?v=4",
  });
}

const PUBLIC_GUEST_PREFIX = "guest:";

export function isPublicGuestId(id: string): boolean {
  return id.startsWith(PUBLIC_GUEST_PREFIX);
}

export function newPublicGuestId(): string {
  return `${PUBLIC_GUEST_PREFIX}${randomUUID()}`;
}

/**
 * Virtual, never-persisted identity for an anonymous public visitor — unique
 * per browser (the id comes from a per-browser signed cookie, see
 * lib/guestToken.ts), reconstructed on every request without a DB call. No
 * row in `User` ever exists for this id, which is what keeps guests isolated
 * from each other and from the owner's own stored secrets.
 */
export function buildPublicGuest(id: string): DbUser {
  const now = new Date().toISOString();
  return {
    id,
    github_id: null,
    google_id: null,
    email: null,
    name: "Guest",
    avatar_url: null,
    created_at: now,
    last_login: now,
    is_guest: true,
  };
}

/** Owner/admin account — kept separate from the shared guest row so the resume
 * owner gets a private, fully-editable settings record. Keyed by a fixed
 * githubId (like the guest) rather than a schema change. */
export async function getOrCreateAdminUser(email: string, name: string): Promise<DbUser> {
  return upsertGithubUser({
    githubId: "admin_owner",
    email,
    name,
    avatarUrl: null,
  });
}

/**
 * Ensure the session user exists in Supabase before any FK-backed write.
 * Fixes stale "local-dev-guest" sessions created while the DB was offline.
 * Never called for public guests (`isGuest`) — see ensureDbUser, which skips
 * them entirely since they're never meant to have a DB row.
 */
export async function resolveDbUser(sessionUser: DbUser): Promise<DbUser> {
  // The local-dev placeholder has no fixed row yet — reconcile it to (or
  // create) its own dedicated DB row. getOrCreateLocalDevUser() already
  // falls back to the in-memory placeholder if Supabase is genuinely
  // unreachable.
  if (sessionUser.id === LOCAL_DEV_SENTINEL_ID) {
    return getOrCreateLocalDevUser();
  }

  const existing = await findUserById(sessionUser.id);
  if (existing) return existing;

  if (sessionUser.github_id === "local_dev_guest") {
    return getOrCreateLocalDevUser();
  }

  if (sessionUser.github_id) {
    return upsertGithubUser({
      githubId: sessionUser.github_id,
      email: sessionUser.email,
      name: sessionUser.name,
      avatarUrl: sessionUser.avatar_url,
    });
  }

  if (sessionUser.google_id) {
    return upsertGoogleUser({
      googleId: sessionUser.google_id,
      email: sessionUser.email,
      emailVerified: true, // a stored google_id only ever came from a verified login
      name: sessionUser.name,
      avatarUrl: sessionUser.avatar_url,
    });
  }

  // No fixed row, no id namespace we recognize, and Supabase doesn't have it
  // either — there is no meaningful identity left to fall back to. Fail
  // closed rather than silently resurrecting a shared guest account.
  throw new Error("Unable to resolve session user in the database.");
}

export async function upsertGithubUser(profile: {
  githubId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}): Promise<DbUser> {
  const row = await prisma.user.upsert({
    where: { githubId: profile.githubId },
    update: {
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      email: profile.email ?? undefined,
      lastLogin: new Date(),
    },
    create: {
      id: randomUUID(),
      githubId: profile.githubId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
  });
  return mapUser(row);
}

/**
 * Google login, with account linking: if this is the first time we've seen
 * this googleId but the verified email already belongs to an existing row
 * with no googleId of its own (e.g. the Admin owner account, keyed by
 * githubId "admin_owner"), attach this googleId to that row instead of
 * creating a duplicate identity for the same person. Restricted to Google
 * only (never upsertGithubUser) because GitHub profile emails aren't
 * verified, and restricted to `emailVerified` so an unverified address can't
 * be used to claim someone else's account.
 */
export async function upsertGoogleUser(profile: {
  googleId: string;
  email: string | null;
  emailVerified?: boolean;
  name: string;
  avatarUrl: string | null;
}): Promise<DbUser> {
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (byGoogleId) {
    const updated = await prisma.user.update({
      where: { id: byGoogleId.id },
      data: {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        email: profile.email ?? undefined,
        lastLogin: new Date(),
      },
    });
    return mapUser(updated);
  }

  if (profile.emailVerified && profile.email) {
    const existingByEmail = await prisma.user.findFirst({
      where: {
        googleId: null,
        email: { equals: profile.email, mode: "insensitive" },
      },
    });
    if (existingByEmail) {
      const linked = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleId: profile.googleId,
          name: profile.name,
          avatarUrl: profile.avatarUrl ?? existingByEmail.avatarUrl,
          lastLogin: new Date(),
        },
      });
      return mapUser(linked);
    }
  }

  const created = await prisma.user.create({
    data: {
      id: randomUUID(),
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
  });
  return mapUser(created);
}

export async function getUserSettings(userId: string): Promise<DbUserSettings | null> {
  if (userId === buildLocalDevGuest().id) return null;
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    return row ? mapSettings(row) : null;
  } catch {
    return null;
  }
}

export async function upsertUserSettings(
  userId: string,
  keys: {
    openai?: string | null;
    anthropic?: string | null;
    coralogix?: string | null;
    coralogixTeamName?: string | null;
    coralogixRegion?: string | null;
    testsOutputDir?: string | null;
    githubIssuesRepo?: string | null;
    jiraDomain?: string | null;
    jiraEmail?: string | null;
    jiraApiToken?: string | null;
  }
): Promise<void> {
  // Prisma omits any field left `undefined` in `update` (leaves it unchanged),
  // so passing the keys straight through has the same effect as the previous
  // findUnique-then-fallback dance, without the extra read on every save.
  await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      openaiApiKey: keys.openai ?? null,
      anthropicApiKey: keys.anthropic ?? null,
      coralogixApiKey: keys.coralogix ?? null,
      coralogixTeamName: keys.coralogixTeamName ?? null,
      coralogixRegion: keys.coralogixRegion ?? "EU",
      testsOutputDir: keys.testsOutputDir ?? null,
      githubIssuesRepo: keys.githubIssuesRepo ?? null,
      jiraDomain: keys.jiraDomain ?? null,
      jiraEmail: keys.jiraEmail ?? null,
      jiraApiToken: keys.jiraApiToken ?? null,
    },
    update: {
      openaiApiKey: keys.openai,
      anthropicApiKey: keys.anthropic,
      coralogixApiKey: keys.coralogix,
      coralogixTeamName: keys.coralogixTeamName,
      coralogixRegion: keys.coralogixRegion,
      testsOutputDir: keys.testsOutputDir,
      githubIssuesRepo: keys.githubIssuesRepo,
      jiraDomain: keys.jiraDomain,
      jiraEmail: keys.jiraEmail,
      jiraApiToken: keys.jiraApiToken,
    },
  });
}

function buildTestFileInfo(
  feature: { slug: string; featureName: string },
  test: { fileName: string; code: string; createdAt: Date; updatedAt: Date }
): TestFileInfo {
  const preview = test.code.split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").slice(0, 120);
  return {
    fileName: test.fileName,
    featureName: feature.featureName,
    featureSlug: feature.slug,
    relativePath: `${feature.slug}/${test.fileName}`,
    sizeBytes: Buffer.byteLength(test.code, "utf-8"),
    createdAt: test.createdAt.toISOString(),
    modifiedAt: test.updatedAt.toISOString(),
    preview,
  };
}

export async function upsertFeatureMeta(
  userId: string,
  meta: FeatureMeta
): Promise<void> {
  await prisma.feature.upsert({
    where: { userId_slug: { userId, slug: meta.slug } },
    create: {
      userId,
      slug: meta.slug,
      featureName: meta.featureName,
      inputType: meta.inputType,
      description: meta.description ?? null,
      prdText: meta.prdText ?? null,
    },
    update: {
      featureName: meta.featureName,
      inputType: meta.inputType,
      description: meta.description ?? null,
      prdText: meta.prdText ?? null,
    },
  });
}

export async function saveGeneratedTest(
  userId: string,
  featureSlug: string,
  fileName: string,
  code: string
): Promise<void> {
  const feature = await prisma.feature.findUnique({
    where: { userId_slug: { userId, slug: featureSlug } },
  });
  if (!feature) throw new Error(`Feature not found: ${featureSlug}`);

  await prisma.generatedTest.upsert({
    where: { featureId_fileName: { featureId: feature.id, fileName } },
    create: { featureId: feature.id, fileName, code },
    update: { code },
  });
}

export async function listFeatureGroups(userId: string): Promise<FeatureGroup[]> {
  const [features, latestBySlug, latestByName] = await Promise.all([
    prisma.feature.findMany({
      where: { userId },
      include: { tests: { orderBy: { fileName: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    getLatestRunBySlug(userId),
    getLatestRunByFeatureName(userId),
  ]);

  const groups = features.map((feature) => {
    const latest = latestBySlug.get(feature.slug) ?? latestByName.get(feature.featureName) ?? null;

    return {
      meta: {
        featureName: feature.featureName,
        slug: feature.slug,
        inputType: feature.inputType as InputType,
        createdAt: feature.createdAt.toISOString(),
        updatedAt: feature.updatedAt.toISOString(),
        description: feature.description ?? undefined,
        prdText: feature.prdText ?? undefined,
        latestRunStatus: latest?.status ?? null,
        lastRunAt: latest?.runAt ?? null,
      },
      tests: feature.tests.map((test) =>
        buildTestFileInfo(
          { slug: feature.slug, featureName: feature.featureName },
          test
        )
      ),
    };
  });

  // Surface features with the most recent activity (last run, falling back to
  // creation time) first, instead of the stale Feature.updatedAt column.
  groups.sort((a, b) => {
    const aTime = new Date(a.meta.lastRunAt ?? a.meta.createdAt).getTime();
    const bTime = new Date(b.meta.lastRunAt ?? b.meta.createdAt).getTime();
    return bTime - aTime;
  });

  return groups;
}

interface LatestRun {
  status: TestRunStatus;
  runAt: string;
}

/** Most recent execution (status + timestamp) per feature slug (from relative_path prefix). */
async function getLatestRunBySlug(userId: string): Promise<Map<string, LatestRun>> {
  const runs = await prisma.testRun.findMany({
    where: { userId, relativePath: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { status: true, relativePath: true, createdAt: true },
  });

  const map = new Map<string, LatestRun>();
  for (const run of runs) {
    const slug = run.relativePath?.split("/")[0];
    if (!slug || map.has(slug)) continue;
    map.set(slug, { status: run.status as TestRunStatus, runAt: run.createdAt.toISOString() });
  }
  return map;
}

/** Fallback match by display feature name when relative_path is missing. */
async function getLatestRunByFeatureName(userId: string): Promise<Map<string, LatestRun>> {
  const runs = await prisma.testRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { status: true, featureName: true, createdAt: true },
  });

  const map = new Map<string, LatestRun>();
  for (const run of runs) {
    if (!run.featureName || map.has(run.featureName)) continue;
    map.set(run.featureName, { status: run.status as TestRunStatus, runAt: run.createdAt.toISOString() });
  }
  return map;
}

export async function getGeneratedTestCode(
  userId: string,
  featureSlug: string,
  fileName: string
): Promise<string | null> {
  const feature = await prisma.feature.findUnique({
    where: { userId_slug: { userId, slug: featureSlug } },
    include: { tests: { where: { fileName } } },
  });
  return feature?.tests[0]?.code ?? null;
}

export async function updateGeneratedTestCode(
  userId: string,
  featureSlug: string,
  fileName: string,
  newCode: string
): Promise<boolean> {
  const feature = await prisma.feature.findUnique({
    where: { userId_slug: { userId, slug: featureSlug } },
  });
  if (!feature) return false;

  const result = await prisma.generatedTest.updateMany({
    where: { featureId: feature.id, fileName },
    data: { code: newCode },
  });
  return result.count > 0;
}

export async function deleteGeneratedTest(
  userId: string,
  featureSlug: string,
  fileName: string
): Promise<boolean> {
  const feature = await prisma.feature.findUnique({
    where: { userId_slug: { userId, slug: featureSlug } },
  });
  if (!feature) return false;

  const result = await prisma.generatedTest.deleteMany({
    where: { featureId: feature.id, fileName },
  });
  return result.count > 0;
}

export async function deleteFeature(userId: string, featureSlug: string): Promise<boolean> {
  const result = await prisma.feature.deleteMany({
    where: { userId, slug: featureSlug },
  });
  return result.count > 0;
}

export async function saveLogAnalysis(
  userId: string,
  data: {
    source: string;
    featureName?: string | null;
    rawLogs: string;
    rootCause: string;
    explanation: string;
    suggestedFix: string;
    severity: string;
    category: string;
    isMock: boolean;
  }
): Promise<DbLogAnalysis> {
  const row = await prisma.logAnalysis.create({
    data: {
      userId,
      source: data.source,
      featureName: data.featureName || null,
      rawLogs: data.rawLogs,
      rootCause: data.rootCause,
      explanation: data.explanation,
      suggestedFix: data.suggestedFix,
      severity: data.severity,
      category: data.category,
      isMock: data.isMock,
    },
  });

  return {
    id: row.id,
    user_id: row.userId,
    source: row.source,
    feature_name: row.featureName,
    raw_logs: row.rawLogs,
    root_cause: row.rootCause,
    explanation: row.explanation,
    suggested_fix: row.suggestedFix,
    severity: row.severity,
    category: row.category,
    is_mock: row.isMock,
    created_at: row.createdAt.toISOString(),
  };
}

export async function listLogAnalyses(userId: string): Promise<DbLogAnalysis[]> {
  const rows = await prisma.logAnalysis.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    user_id: row.userId,
    source: row.source,
    feature_name: row.featureName,
    raw_logs: row.rawLogs,
    root_cause: row.rootCause,
    explanation: row.explanation,
    suggested_fix: row.suggestedFix,
    severity: row.severity,
    category: row.category,
    is_mock: row.isMock,
    created_at: row.createdAt.toISOString(),
  }));
}

export async function getLogAnalysisById(
  userId: string,
  id: string
): Promise<DbLogAnalysis | null> {
  const row = await prisma.logAnalysis.findFirst({ where: { id, userId } });
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.userId,
    source: row.source,
    feature_name: row.featureName,
    raw_logs: row.rawLogs,
    root_cause: row.rootCause,
    explanation: row.explanation,
    suggested_fix: row.suggestedFix,
    severity: row.severity,
    category: row.category,
    is_mock: row.isMock,
    created_at: row.createdAt.toISOString(),
  };
}

export async function deleteLogAnalysis(userId: string, id: string): Promise<boolean> {
  const result = await prisma.logAnalysis.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

// ─── Manual STD (Standard Test Documentation) ─────────────────────────────────

function mapManualStd(row: {
  id: string;
  userId: string;
  featureName: string;
  slug: string;
  inputType: string;
  domain: string;
  testCases: Prisma.JsonValue;
  coverage: Prisma.JsonValue;
  model: string;
  isMock: boolean;
  createdAt: Date;
}): ManualStdRecord {
  return {
    id: row.id,
    user_id: row.userId,
    feature_name: row.featureName,
    slug: row.slug,
    input_type: row.inputType as InputType,
    domain: row.domain as StdDomain,
    test_cases: row.testCases as unknown as ManualStdTestCase[],
    coverage: row.coverage as unknown as StdCoverageRow[],
    model: row.model,
    is_mock: row.isMock,
    created_at: row.createdAt.toISOString(),
  };
}

export async function saveManualStd(
  userId: string,
  data: {
    featureName: string;
    slug: string;
    inputType: InputType;
    domain: StdDomain;
    testCases: ManualStdTestCase[];
    coverage: StdCoverageRow[];
    model: string;
    isMock: boolean;
  }
): Promise<ManualStdRecord> {
  const row = await prisma.manualStd.create({
    data: {
      userId,
      featureName: data.featureName,
      slug: data.slug,
      inputType: data.inputType,
      domain: data.domain,
      testCases: data.testCases as unknown as Prisma.InputJsonValue,
      coverage: data.coverage as unknown as Prisma.InputJsonValue,
      model: data.model,
      isMock: data.isMock,
    },
  });

  return mapManualStd(row);
}

export async function listManualStds(userId: string): Promise<ManualStdRecord[]> {
  const rows = await prisma.manualStd.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapManualStd);
}

export async function getManualStdById(userId: string, id: string): Promise<ManualStdRecord | null> {
  const row = await prisma.manualStd.findFirst({ where: { id, userId } });
  return row ? mapManualStd(row) : null;
}

export async function deleteManualStd(userId: string, id: string): Promise<boolean> {
  const result = await prisma.manualStd.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

// ─── Showcase links (public, no-login case-study views) ──────────────────────

function generateShowcaseSlug(): string {
  return randomBytes(9).toString("base64url");
}

function mapShowcaseLink(row: {
  id: string;
  slug: string;
  artifactType: string;
  sourceId: string;
  title: string;
  viewCount: number;
  createdAt: Date;
  revokedAt: Date | null;
}): ShowcaseLinkRecord {
  return {
    id: row.id,
    slug: row.slug,
    artifact_type: row.artifactType as ShowcaseArtifactType,
    source_id: row.sourceId,
    title: row.title,
    view_count: row.viewCount,
    created_at: row.createdAt.toISOString(),
    revoked_at: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

/** Publishes a ManualStd as a public showcase link. Snapshots the content at publish
 * time (see ShowcaseLink model comment) rather than referencing the live row. */
export async function createManualStdShowcase(
  userId: string,
  std: ManualStdRecord
): Promise<ShowcaseLinkRecord> {
  const snapshot: ShowcaseManualStdSnapshot = {
    featureName: std.feature_name,
    domain: std.domain,
    testCases: std.test_cases,
    coverage: std.coverage,
    model: std.model,
    isMock: std.is_mock,
  };
  const row = await prisma.showcaseLink.create({
    data: {
      userId,
      slug: generateShowcaseSlug(),
      artifactType: "manual_std",
      sourceId: std.id,
      title: std.feature_name,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  return mapShowcaseLink(row);
}

/** Publishes one generated Playwright test file (PRD → AI-generated code → most
 * recent execution result) as a public showcase link. Same snapshot-at-publish-time
 * approach as createManualStdShowcase. Returns null if the feature/file doesn't
 * exist or belong to this user. */
export async function createFeatureTestShowcase(
  userId: string,
  featureSlug: string,
  fileName: string
): Promise<ShowcaseLinkRecord | null> {
  const feature = await prisma.feature.findUnique({
    where: { userId_slug: { userId, slug: featureSlug } },
    include: { tests: { where: { fileName } } },
  });
  const test = feature?.tests[0];
  if (!feature || !test) return null;

  const latestRun = await prisma.testRun.findFirst({
    where: {
      userId,
      status: { in: ["PASSED", "FAILED"] },
      OR: [{ testFileId: test.id }, { relativePath: `${featureSlug}/${fileName}` }],
    },
    orderBy: { createdAt: "desc" },
  });

  const snapshot: ShowcaseFeatureTestSnapshot = {
    featureName: feature.featureName,
    description: feature.description,
    prdText: feature.prdText,
    inputType: feature.inputType as InputType,
    fileName: test.fileName,
    code: test.code,
    latestRun: latestRun
      ? {
          status: latestRun.status as "PASSED" | "FAILED",
          durationMs: latestRun.durationMs,
          ranAt: latestRun.createdAt.toISOString(),
        }
      : null,
  };

  const row = await prisma.showcaseLink.create({
    data: {
      userId,
      slug: generateShowcaseSlug(),
      artifactType: "feature_test",
      sourceId: test.id,
      title: `${feature.featureName} — ${test.fileName}`,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  return mapShowcaseLink(row);
}

export async function listShowcaseLinks(userId: string): Promise<ShowcaseLinkRecord[]> {
  const rows = await prisma.showcaseLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapShowcaseLink);
}

export async function revokeShowcaseLink(userId: string, id: string): Promise<boolean> {
  const result = await prisma.showcaseLink.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/** Public read — no userId scoping, this is what an unauthenticated visitor hits.
 * Returns null for an unknown slug or a revoked link, and atomically bumps the
 * view counter on every successful lookup. */
export async function getShowcaseBySlug(slug: string): Promise<ShowcasePublicView | null> {
  const row = await prisma.showcaseLink.findUnique({ where: { slug } });
  if (!row || row.revokedAt) return null;

  await prisma.showcaseLink.update({
    where: { id: row.id },
    data: { viewCount: { increment: 1 } },
  });

  return {
    slug: row.slug,
    artifact_type: row.artifactType as ShowcaseArtifactType,
    title: row.title,
    created_at: row.createdAt.toISOString(),
    snapshot: row.snapshot as unknown as ShowcaseManualStdSnapshot,
  };
}

// ─── Self-heal events (AI "fix this failing test" attempts) ──────────────────

export async function recordSelfHealEvent(
  userId: string,
  data: { featureSlug?: string; fileName?: string; durationMs: number; isMock: boolean }
): Promise<void> {
  await prisma.selfHealEvent.create({
    data: {
      userId,
      featureSlug: data.featureSlug ?? null,
      fileName: data.fileName ?? null,
      durationMs: data.durationMs,
      isMock: data.isMock,
    },
  });
}

export async function getSelfHealStats(userId: string): Promise<SelfHealStats> {
  const [agg, mockCount] = await Promise.all([
    prisma.selfHealEvent.aggregate({
      where: { userId },
      _avg: { durationMs: true },
      _count: true,
    }),
    prisma.selfHealEvent.count({ where: { userId, isMock: true } }),
  ]);

  return {
    averageDurationMs: agg._avg.durationMs != null ? Math.round(agg._avg.durationMs) : null,
    count: agg._count,
    mockCount,
  };
}

// ─── Test runs (execution history) ───────────────────────────────────────────

export type TestRunStatus = "RUNNING" | "PASSED" | "FAILED";

export interface DbTestRun {
  id: string;
  user_id: string;
  test_file_id: string | null;
  feature_name: string;
  test_file_name: string | null;
  relative_path: string | null;
  status: TestRunStatus;
  duration_ms: number;
  github_run_id: string | null;
  runner: string | null;
  html_url: string | null;
  artifact_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function mapTestRun(row: {
  id: string;
  userId: string;
  testFileId: string | null;
  featureName: string;
  testFileName: string | null;
  relativePath: string | null;
  status: string;
  durationMs: number;
  gitHubRunId: string | null;
  runner: string | null;
  htmlUrl: string | null;
  artifactMeta: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DbTestRun {
  return {
    id: row.id,
    user_id: row.userId,
    test_file_id: row.testFileId,
    feature_name: row.featureName,
    test_file_name: row.testFileName,
    relative_path: row.relativePath,
    status: row.status as TestRunStatus,
    duration_ms: row.durationMs,
    github_run_id: row.gitHubRunId,
    runner: row.runner,
    html_url: row.htmlUrl,
    artifact_meta: (row.artifactMeta as Record<string, unknown> | null) ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function resolveGeneratedTestId(
  userId: string,
  relativePath?: string
): Promise<string | null> {
  if (!relativePath) return null;
  const parts = relativePath.split("/");
  if (parts.length < 2) return null;
  const slug = parts[0];
  const fileName = parts.slice(1).join("/");
  const feature = await prisma.feature.findUnique({
    where: { userId_slug: { userId, slug } },
    include: { tests: { where: { fileName } } },
  });
  return feature?.tests[0]?.id ?? null;
}

export async function getFeatureNameBySlug(userId: string, slug: string): Promise<string | null> {
  const feature = await prisma.feature.findUnique({
    where: { userId_slug: { userId, slug } },
    select: { featureName: true },
  });
  return feature?.featureName ?? null;
}

export function normalizeGitHubRunId(value: number | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

export async function createTestRun(
  userId: string,
  data: {
    testFileId?: string | null;
    featureName: string;
    testFileName?: string | null;
    relativePath?: string | null;
    gitHubRunId?: number | string | null;
    runner?: string;
  }
): Promise<DbTestRun> {
  const row = await prisma.testRun.create({
    data: {
      userId,
      testFileId: data.testFileId ?? null,
      featureName: data.featureName,
      testFileName: data.testFileName ?? null,
      relativePath: data.relativePath ?? null,
      status: "RUNNING",
      gitHubRunId: normalizeGitHubRunId(data.gitHubRunId),
      runner: data.runner ?? "local",
    },
  });
  return mapTestRun(row);
}

export async function updateTestRun(
  userId: string,
  id: string,
  data: {
    status?: TestRunStatus;
    durationMs?: number;
    gitHubRunId?: number | string | null;
    htmlUrl?: string | null;
    runner?: string;
    artifactMeta?: Record<string, unknown> | null;
  }
): Promise<DbTestRun | null> {
  const existing = await prisma.testRun.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const isTerminal =
    data.status != null && data.status !== "RUNNING" && existing.status === "RUNNING";
  const resolvedDuration =
    data.durationMs != null && data.durationMs > 0
      ? data.durationMs
      : isTerminal
        ? Math.max(0, Date.now() - existing.createdAt.getTime())
        : data.durationMs;

  try {
    const row = await prisma.testRun.update({
      where: { id },
      data: {
        status: data.status,
        durationMs: resolvedDuration,
        gitHubRunId:
          data.gitHubRunId !== undefined
            ? normalizeGitHubRunId(data.gitHubRunId)
            : undefined,
        htmlUrl: data.htmlUrl,
        runner: data.runner,
        artifactMeta:
          data.artifactMeta === null
            ? Prisma.JsonNull
            : (data.artifactMeta as Prisma.InputJsonValue | undefined),
      },
    });
    return mapTestRun(row);
  } catch (err) {
    console.error("[test-run] update failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function listTestRuns(userId: string, limit = 50): Promise<DbTestRun[]> {
  const rows = await prisma.testRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapTestRun);
}

/** Mark long-abandoned RUNNING rows as FAILED so metrics stay accurate. */
const STALE_RUNNING_MS = 2 * 60 * 60 * 1000;
/** Runs newer than this are considered actively in progress. */
const ACTIVE_RUNNING_MS = 30 * 60 * 1000;

export async function reconcileStaleRunningRuns(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const stale = await prisma.testRun.findMany({
    where: {
      userId,
      status: "RUNNING",
      createdAt: { lt: cutoff },
    },
    select: { id: true, createdAt: true },
  });

  const now = Date.now();
  await Promise.all(
    stale.map((run) =>
      prisma.testRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          durationMs: Math.max(0, now - run.createdAt.getTime()),
        },
      })
    )
  );

  if (stale.length > 0) {
    console.info(
      `[dashboard] reconciled ${stale.length} stale RUNNING test run(s) for user ${userId}`
    );
  }
  return stale.length;
}

/** A test is "flaky" here if the same file has BOTH a passed and a failed result
 * within its most recent runs — a real, unresolved signal distinct from a test
 * that simply broke once and was fixed. Sampled over the last 300 completed runs
 * (not all-time) so a long-fixed flake doesn't haunt the list forever. */
async function getFlakyTests(userId: string): Promise<FlakyTestEntry[]> {
  const sample = await prisma.testRun.findMany({
    where: { userId, status: { in: ["PASSED", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      testFileId: true,
      featureName: true,
      testFileName: true,
      status: true,
      createdAt: true,
    },
  });

  const groups = new Map<
    string,
    { featureName: string; testFileName: string | null; passed: number; failed: number; lastStatus: "PASSED" | "FAILED"; lastRunAt: Date }
  >();

  for (const run of sample) {
    if (!run.testFileName) continue; // no file identity to group by
    const key = run.testFileId ?? `${run.featureName}::${run.testFileName}`;
    const existing = groups.get(key);
    if (existing) {
      if (run.status === "PASSED") existing.passed += 1;
      else existing.failed += 1;
      // `sample` is already newest-first, so the first row seen per key is the latest.
    } else {
      groups.set(key, {
        featureName: run.featureName,
        testFileName: run.testFileName,
        passed: run.status === "PASSED" ? 1 : 0,
        failed: run.status === "FAILED" ? 1 : 0,
        lastStatus: run.status as "PASSED" | "FAILED",
        lastRunAt: run.createdAt,
      });
    }
  }

  return [...groups.entries()]
    .filter(([, g]) => g.passed > 0 && g.failed > 0)
    .map(([key, g]) => ({
      key,
      featureName: g.featureName,
      testFileName: g.testFileName,
      passedCount: g.passed,
      failedCount: g.failed,
      lastStatus: g.lastStatus,
      lastRunAt: g.lastRunAt.toISOString(),
    }))
    .sort((a, b) => Math.min(b.passedCount, b.failedCount) - Math.min(a.passedCount, a.failedCount))
    .slice(0, 5);
}

export async function getTestRunDashboardStats(userId: string): Promise<{
  totalRuns: number;
  completedRuns: number;
  runningRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRatePercent: number | null;
  averageDurationMs: number | null;
  recentRuns: DbTestRun[];
  selfHeal: SelfHealStats;
  flakyTests: FlakyTestEntry[];
}> {
  await reconcileStaleRunningRuns(userId);

  const activeRunningCutoff = new Date(Date.now() - ACTIVE_RUNNING_MS);

  // ── Aggregate metrics across ALL completed runs in the DB ─────────────────
  // Using Prisma's aggregate so we never load every row into memory.
  const [
    totalRuns,
    completedCount,
    runningCount,
    failedCount,
    passedCount,
    durationAgg,
    recentRuns,
    selfHeal,
    flakyTests,
  ] = await Promise.all([
    prisma.testRun.count({ where: { userId } }),
    prisma.testRun.count({ where: { userId, status: { not: "RUNNING" } } }),
    prisma.testRun.count({
      where: {
        userId,
        status: "RUNNING",
        createdAt: { gte: activeRunningCutoff },
      },
    }),
    prisma.testRun.count({ where: { userId, status: "FAILED" } }),
    prisma.testRun.count({ where: { userId, status: "PASSED" } }),
    // Average only over completed runs that actually recorded a duration (> 0)
    prisma.testRun.aggregate({
      where: { userId, status: { not: "RUNNING" }, durationMs: { gt: 0 } },
      _avg: { durationMs: true },
    }),
    // Recent 30 rows for the table display only (not used for metric maths)
    listTestRuns(userId, 30),
    getSelfHealStats(userId),
    getFlakyTests(userId),
  ]);

  const passRatePercent =
    completedCount > 0 ? Math.round((passedCount / completedCount) * 100) : null;

  const averageDurationMs =
    durationAgg._avg.durationMs != null
      ? Math.round(durationAgg._avg.durationMs)
      : null;

  return {
    totalRuns,
    completedRuns: completedCount,
    runningRuns: runningCount,
    passedRuns: passedCount,
    failedRuns: failedCount,
    passRatePercent,
    averageDurationMs,
    recentRuns,
    selfHeal,
    flakyTests,
  };
}
