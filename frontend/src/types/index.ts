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
}

export interface FeatureGroup {
  meta: FeatureMeta;
  tests: TestFileInfo[];
}

export interface LogAnalysisRecord {
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
