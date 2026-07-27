export interface UserStory {
  id: string;
  title: string;
  steps: string[];
  acceptanceCriteria: string[];
}

export interface ParsedPrd {
  rawText: string;
  fileName: string;
  format: "pdf" | "docx" | "md" | "txt";
  userStories: UserStory[];
}

export interface GenerateTestsResult {
  code: string;
  userStories: UserStory[];
  model: string;
  isMock: boolean;
}

export interface RunTestResult {
  testId: string;
  testRunId?: string;
  status: "passed" | "failed" | "error" | "running";
  output: string;
  duration: number;
  errorDetails?: string;
  cloudRunId?: number;
  htmlUrl?: string;
  rawLogs?: string;
  runner?: string;
}

export type TestRunStatus = "RUNNING" | "PASSED" | "FAILED";

export interface TestRunRecord {
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

export interface DashboardStats {
  totalRuns: number;
  completedRuns: number;
  runningRuns: number;
  passedRuns: number;
  failedRuns: number;
  /** null = no completed runs yet (show N/A instead of 0%) */
  passRatePercent: number | null;
  /** null = no runs with recorded duration (show N/A) */
  averageDurationMs: number | null;
  recentRuns: TestRunRecord[];
}

export interface RunArtifactInfo {
  id: number;
  name: string;
  sizeBytes: number;
}

export interface RunArtifactGallery {
  runId: number;
  artifacts: RunArtifactInfo[];
  screenshots: Array<{ name: string; dataUrl: string }>;
}

export interface McpLog {
  timestamp: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  service: string;
  message: string;
  traceId?: string;
  statusCode?: number;
}

export interface FailureAnalysis {
  rootCause: string;
  explanation: string;
  suggestedFix: string;
  logs: McpLog[];
  isMock: boolean;
}

export type AppStatus =
  | "idle"
  | "uploading"
  | "generating"
  | "running"
  | "analyzing"
  | "done";

export interface McpStep {
  step: number;
  tool: string;
  message: string;
  logCount?: number;
  errorTraceCount?: number;
}

export interface RawLogAnalysisResponse {
  rootCause: string;
  explanation: string;
  suggestedFix: string;
  severity: string;
  category: string;
  isMock: boolean;
}

export type InputType = "prd" | "swagger";

export interface TestFileInfo {
  fileName: string;
  featureName: string;
  featureSlug: string;
  relativePath: string;
  sizeBytes: number;
  createdAt: string;
  modifiedAt: string;
  preview: string;
}

export interface FeatureMeta {
  featureName: string;
  slug: string;
  inputType: InputType;
  createdAt: string;
  updatedAt: string;
  description?: string;
  prdText?: string;
  /** Latest test execution status for this feature, if any */
  latestRunStatus?: TestRunStatus | null;
  /** Timestamp of the most recent test run for this feature, if any */
  lastRunAt?: string | null;
}

export interface FeatureGroup {
  meta: FeatureMeta;
  tests: TestFileInfo[];
}

// ─── Manual STD (Standard Test Documentation) generator ───────────────────────

export type StdDomain = "fintech" | "general";

export type StdCategory = "A" | "B" | "C" | "D" | "E" | "F";

export type StdTestType =
  | "UI"
  | "Functional"
  | "Security/RBAC"
  | "Data Integrity"
  | "API"
  | "Negative"
  | "Accessibility"
  | "Integration";

export type StdRiskLevel = "P0" | "P1" | "P2" | "P3";

export interface ManualStdTestCase {
  category: StdCategory;
  id: string;
  testType: StdTestType;
  scenario: string;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
  validationMethod: string;
  riskLevel: StdRiskLevel;
  riskImpact: string;
}

export interface StdCoverageRow {
  requirement: string;
  testCaseIds: string[];
}

export interface GenerateManualStdResult {
  testCases: ManualStdTestCase[];
  coverage: StdCoverageRow[];
  model: string;
  isMock: boolean;
  domain: StdDomain;
}

export interface ManualStdRecord {
  id: string;
  user_id: string;
  feature_name: string;
  slug: string;
  input_type: InputType;
  domain: StdDomain;
  test_cases: ManualStdTestCase[];
  coverage: StdCoverageRow[];
  model: string;
  is_mock: boolean;
  created_at: string;
}

export interface LogAnalysisRecord {
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
