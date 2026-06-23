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
  status: "passed" | "failed" | "error";
  output: string;
  duration: number;
  errorDetails?: string;
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
