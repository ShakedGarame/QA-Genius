export type InputType = "prd" | "swagger";

export interface ParsedPrd {
  rawText: string;
  fileName: string;
  format: "pdf" | "docx" | "md" | "txt";
  userStories: UserStory[];
}

export interface UserStory {
  id: string;
  title: string;
  steps: string[];
  acceptanceCriteria: string[];
}

export interface ParsedSwagger {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: SwaggerEndpoint[];
  rawJson: object;
}

export interface SwaggerEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  operationId?: string;
  summary?: string;
  requestBodySchema?: object;
  responseSchema?: object;
  parameters?: { name: string; in: string; required: boolean }[];
  tags?: string[];
}

export interface GenerateTestsRequest {
  prdText?: string;
  swaggerContent?: string;
  featureName: string;
  inputType: InputType;
  fileName?: string;
  framework?: "playwright";
}

export interface GenerateTestsResponse {
  code: string;
  userStories: UserStory[];
  model: string;
  isMock: boolean;
}

export interface RunTestRequest {
  code?: string;
  fileName?: string;
  featureName?: string;
  testId?: string;
}

export interface RunTestResult {
  status: "passed" | "failed" | "error";
  output: string;
  duration: number;
  errorDetails?: string;
  testId: string;
}

export interface AnalyzeFailureRequest {
  testCode: string;
  errorOutput: string;
  testId: string;
}

export interface McpLog {
  timestamp: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  service: string;
  message: string;
  traceId?: string;
  statusCode?: number;
}

export interface AnalyzeFailureResponse {
  explanation: string;
  logs: McpLog[];
  rootCause: string;
  suggestedFix: string;
  isMock: boolean;
}

// ─── Feature / History entity ─────────────────────────────────────────────────

export interface FeatureMeta {
  featureName: string;
  slug: string;
  inputType: InputType;
  createdAt: string;
  updatedAt: string;
  description?: string;
  prdText?: string;         // truncated snippet for display
}

export interface TestFileInfo {
  fileName: string;
  featureName: string;
  featureSlug: string;
  relativePath: string;     // e.g. "authentication/login.spec.ts"
  sizeBytes: number;
  createdAt: string;
  modifiedAt: string;
  preview: string;
}

export interface FeatureGroup {
  meta: FeatureMeta;
  tests: TestFileInfo[];
}
