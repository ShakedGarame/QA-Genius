/**
 * PostgreSQL data layer (Supabase) — users, settings, features, tests, log analyses.
 */
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import type { FeatureGroup, FeatureMeta, InputType, TestFileInfo } from "./types/index.js";

export interface DbUser {
  id: string;
  github_id: string | null;
  google_id: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
  created_at: string;
  last_login: string;
}

export interface DbUserSettings {
  user_id: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  coralogix_api_key: string | null;
  coralogix_team_name: string | null;
  coralogix_region: string | null;
  tests_output_dir: string | null;
  updated_at: string;
}

export interface DbLogAnalysis {
  id: string;
  user_id: string;
  source: string;
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

/** Stable in-memory guest used when Supabase is temporarily unreachable locally. */
export function buildLocalDevGuest(): DbUser {
  return {
    id: "local-dev-guest",
    github_id: "mock_user_123",
    google_id: null,
    email: "guest@qa-genius.com",
    name: "Guest Developer",
    avatar_url: "https://avatars.githubusercontent.com/u/0?v=4",
    created_at: new Date().toISOString(),
    last_login: new Date().toISOString(),
  };
}

export async function getOrCreateGuestUser(): Promise<DbUser> {
  try {
    return await upsertGithubUser({
      githubId: "mock_user_123",
      email: "guest@qa-genius.com",
      name: "Guest Developer",
      avatarUrl: "https://avatars.githubusercontent.com/u/0?v=4",
    });
  } catch (err) {
    console.warn(
      "[auth] Supabase unreachable — using offline guest:",
      err instanceof Error ? err.message : err
    );
    return buildLocalDevGuest();
  }
}

export async function upsertGithubUser(profile: {
  githubId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}): Promise<DbUser> {
  const existing = await prisma.user.findUnique({ where: { githubId: profile.githubId } });
  if (existing) {
    const row = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        email: profile.email ?? undefined,
        lastLogin: new Date(),
      },
    });
    return mapUser(row);
  }

  const row = await prisma.user.create({
    data: {
      id: randomUUID(),
      githubId: profile.githubId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
  });
  return mapUser(row);
}

export async function upsertGoogleUser(profile: {
  googleId: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
}): Promise<DbUser> {
  const existing = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (existing) {
    const row = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        email: profile.email ?? undefined,
        lastLogin: new Date(),
      },
    });
    return mapUser(row);
  }

  const row = await prisma.user.create({
    data: {
      id: randomUUID(),
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
  });
  return mapUser(row);
}

export async function getUserSettings(userId: string): Promise<DbUserSettings | null> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  return row ? mapSettings(row) : null;
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
  }
): Promise<void> {
  const existing = await prisma.userSettings.findUnique({ where: { userId } });

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
    },
    update: {
      openaiApiKey: keys.openai !== undefined ? keys.openai : existing?.openaiApiKey,
      anthropicApiKey: keys.anthropic !== undefined ? keys.anthropic : existing?.anthropicApiKey,
      coralogixApiKey: keys.coralogix !== undefined ? keys.coralogix : existing?.coralogixApiKey,
      coralogixTeamName:
        keys.coralogixTeamName !== undefined ? keys.coralogixTeamName : existing?.coralogixTeamName,
      coralogixRegion:
        keys.coralogixRegion !== undefined ? keys.coralogixRegion : existing?.coralogixRegion,
      testsOutputDir:
        keys.testsOutputDir !== undefined ? keys.testsOutputDir : existing?.testsOutputDir,
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
  const features = await prisma.feature.findMany({
    where: { userId },
    include: { tests: { orderBy: { fileName: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  return features.map((feature) => ({
    meta: {
      featureName: feature.featureName,
      slug: feature.slug,
      inputType: feature.inputType as InputType,
      createdAt: feature.createdAt.toISOString(),
      updatedAt: feature.updatedAt.toISOString(),
      description: feature.description ?? undefined,
      prdText: feature.prdText ?? undefined,
    },
    tests: feature.tests.map((test) =>
      buildTestFileInfo(
        { slug: feature.slug, featureName: feature.featureName },
        test
      )
    ),
  }));
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

  try {
    const row = await prisma.testRun.update({
      where: { id },
      data: {
        status: data.status,
        durationMs: data.durationMs,
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

export async function getTestRunDashboardStats(userId: string): Promise<{
  totalRuns: number;
  passRatePercent: number;
  averageDurationMs: number;
  recentRuns: DbTestRun[];
}> {
  const recentRuns = await listTestRuns(userId, 30);
  const completed = recentRuns.filter((r) => r.status !== "RUNNING");
  const passed = completed.filter((r) => r.status === "PASSED");
  const passRatePercent =
    completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;
  const averageDurationMs =
    completed.length > 0
      ? Math.round(completed.reduce((sum, r) => sum + r.duration_ms, 0) / completed.length)
      : 0;

  const totalRuns = await prisma.testRun.count({ where: { userId } });

  return {
    totalRuns,
    passRatePercent,
    averageDurationMs,
    recentRuns,
  };
}
