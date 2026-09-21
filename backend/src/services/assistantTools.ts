import {
  getTestRunDashboardStats,
  listTestRuns,
  listManualStds,
  listLogAnalyses,
  listFeatureGroups,
} from "../db.js";

/** JSON-schema-ish shape both OpenAI (function parameters) and Anthropic
 * (tool input_schema) accept as-is. */
export interface AssistantToolParam {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface AssistantTool {
  name: string;
  description: string;
  parameters: AssistantToolParam;
  execute: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const NO_PARAMS: AssistantToolParam = { type: "object", properties: {} };

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    name: "get_dashboard_stats",
    description:
      "Get aggregate stats for this user. Returns TWO different kinds of numbers that must " +
      "not be confused: `totalRuns` etc. count individual test EXECUTIONS (the same automated " +
      "test rerun 5 times counts as 5), while `distinctAutomatedTestCount` is how many distinct " +
      "automated test files the user has (that same test counts as 1). Use totalRuns/passRatePercent " +
      "for questions like 'how many times have tests run' or 'what's my pass rate'; use " +
      "distinctAutomatedTestCount for 'how many automated tests do I have'.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const stats = await getTestRunDashboardStats(userId);
      return {
        totalRuns: stats.totalRuns,
        distinctAutomatedTestCount: stats.distinctAutomatedTestCount,
        completedRuns: stats.completedRuns,
        runningRuns: stats.runningRuns,
        passedRuns: stats.passedRuns,
        failedRuns: stats.failedRuns,
        passRatePercent: stats.passRatePercent,
        averageDurationMs: stats.averageDurationMs,
      };
    },
  },
  {
    name: "list_recent_test_runs",
    description:
      "List the user's most recent test runs (feature, file, status, duration, when it ran). " +
      "Use for questions about specific recent runs, not aggregate stats.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max runs to return, default 10, max 30." },
      },
    },
    execute: async (userId, args) => {
      const rawLimit = Number(args.limit);
      const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 30);
      const runs = await listTestRuns(userId, limit);
      return runs.map((r) => ({
        feature: r.feature_name,
        file: r.test_file_name,
        status: r.status,
        durationMs: r.duration_ms,
        createdAt: r.created_at,
      }));
    },
  },
  {
    name: "get_flakiness_stats",
    description:
      "Get the user's flakiest tests (same file with both a pass and a fail in its recent " +
      "history) and self-heal statistics (how often auto-healing ran, average duration). " +
      "Use for questions like 'what's my flakiest test' or 'how well does self-heal perform'.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      // getTestRunDashboardStats already computes both of these internally — no new query.
      const stats = await getTestRunDashboardStats(userId);
      return {
        flakyTests: stats.flakyTests.map((t) => ({
          feature: t.featureName,
          file: t.testFileName,
          passedCount: t.passedCount,
          failedCount: t.failedCount,
          lastStatus: t.lastStatus,
          lastRunAt: t.lastRunAt,
        })),
        selfHeal: stats.selfHeal,
      };
    },
  },
  {
    name: "list_manual_stds",
    description:
      "List the user's manually generated Standard Test Documentation (STD) records: " +
      "feature name, detected domain, how many test cases each has, when created. " +
      "Use for questions like 'how many STDs did I write'.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const stds = await listManualStds(userId);
      return stds.slice(0, 20).map((s) => ({
        featureName: s.feature_name,
        domain: s.domain,
        testCaseCount: s.test_cases.length,
        isMock: s.is_mock,
        createdAt: s.created_at,
      }));
    },
  },
  {
    name: "list_log_analyses",
    description:
      "List the user's AI log-analysis results: feature, severity, category, root cause, " +
      "when analyzed. Use for questions about past failure investigations.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const analyses = await listLogAnalyses(userId);
      return analyses.slice(0, 20).map((a) => ({
        feature: a.feature_name,
        source: a.source,
        severity: a.severity,
        category: a.category,
        rootCause: a.root_cause,
        createdAt: a.created_at,
      }));
    },
  },
  {
    name: "list_features",
    description:
      "List the user's tracked features/user-flows: name, how many generated test files each " +
      "has, and the status of its most recent run. Use for coverage-style questions.",
    parameters: NO_PARAMS,
    execute: async (userId) => {
      const groups = await listFeatureGroups(userId);
      return groups.slice(0, 30).map((g) => ({
        featureName: g.meta.featureName,
        testCount: g.tests.length,
        latestRunStatus: g.meta.latestRunStatus ?? null,
        lastRunAt: g.meta.lastRunAt ?? null,
      }));
    },
  },
];

export function findAssistantTool(name: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}

/** Runs a tool by name and never throws — a failed tool becomes a `{ error }`
 * object the model can see and work around, instead of aborting the whole chat.
 * The error message is deliberately generic (not `err.message`) — same
 * internal-detail-hiding convention as `sendError`/`normalizeError` in
 * `lib/errors.ts`, since this `{ error }` can end up quoted back to the user
 * by the model. */
export async function executeAssistantTool(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = findAssistantTool(name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(userId, args);
  } catch (err) {
    console.error(`[assistant] tool "${name}" failed for user ${userId}:`, err);
    return { error: "This data is temporarily unavailable, please try again." };
  }
}
