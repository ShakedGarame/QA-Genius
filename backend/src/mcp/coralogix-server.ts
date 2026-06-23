/**
 * Simulated MCP (Model Context Protocol) Server — Coralogix Log Tool
 *
 * In a real production environment this would be an actual MCP server
 * exposing Coralogix / Datadog log-query tools over stdio or HTTP transport.
 *
 * Here we simulate realistic log payloads that mirror what a Coralogix
 * query would return for a test failure scenario.
 */

import { McpLog } from "../types/index.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const AVAILABLE_TOOLS: McpTool[] = [
  {
    name: "query_logs",
    description: "Query application logs from Coralogix within a time range",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name filter" },
        level: { type: "string", enum: ["ERROR", "WARN", "INFO", "DEBUG", "ALL"] },
        timeRange: { type: "number", description: "Time range in minutes (default 15)" },
        traceId: { type: "string", description: "Optional trace ID to correlate" },
      },
      required: [],
    },
  },
  {
    name: "get_error_traces",
    description: "Retrieve the last N error traces from a specific service",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string" },
        limit: { type: "number", default: 10 },
      },
    },
  },
];

function generateTimestamp(offsetSeconds: number): string {
  const d = new Date(Date.now() - offsetSeconds * 1000);
  return d.toISOString();
}

const MOCK_LOG_SCENARIOS: McpLog[][] = [
  // Scenario A — 500 backend error
  [
    {
      timestamp: generateTimestamp(120),
      level: "INFO",
      service: "api-gateway",
      message: "POST /api/checkout received — forwarding to checkout-service",
      traceId: "trace-7f3a91b2",
      statusCode: 200,
    },
    {
      timestamp: generateTimestamp(119),
      level: "INFO",
      service: "checkout-service",
      message: "Validating checkout payload for user#4821",
      traceId: "trace-7f3a91b2",
    },
    {
      timestamp: generateTimestamp(118),
      level: "ERROR",
      service: "checkout-service",
      message:
        "UnhandledPromiseRejection: Cannot read property 'price' of undefined at validateCartItems (cart.service.ts:87)",
      traceId: "trace-7f3a91b2",
      statusCode: 500,
    },
    {
      timestamp: generateTimestamp(117),
      level: "ERROR",
      service: "api-gateway",
      message:
        "Upstream checkout-service responded with 500 — returning error to client",
      traceId: "trace-7f3a91b2",
      statusCode: 500,
    },
    {
      timestamp: generateTimestamp(115),
      level: "WARN",
      service: "frontend",
      message: "API call to /api/checkout returned 500 — rendering error state",
      traceId: "trace-7f3a91b2",
    },
  ],
  // Scenario B — timeout / slow response
  [
    {
      timestamp: generateTimestamp(60),
      level: "INFO",
      service: "auth-service",
      message: "Token validation started for session abc-123",
      traceId: "trace-2d8f44c1",
    },
    {
      timestamp: generateTimestamp(55),
      level: "WARN",
      service: "auth-service",
      message: "Redis connection latency high: 890ms (threshold: 200ms)",
      traceId: "trace-2d8f44c1",
    },
    {
      timestamp: generateTimestamp(45),
      level: "WARN",
      service: "api-gateway",
      message: "Request to auth-service has been pending for 10s — possible timeout",
      traceId: "trace-2d8f44c1",
    },
    {
      timestamp: generateTimestamp(35),
      level: "ERROR",
      service: "api-gateway",
      message: "Request timed out after 30s — upstream auth-service did not respond",
      traceId: "trace-2d8f44c1",
      statusCode: 504,
    },
    {
      timestamp: generateTimestamp(30),
      level: "ERROR",
      service: "frontend",
      message: "Gateway timeout 504 — login page cannot proceed. User sees loading spinner indefinitely.",
      traceId: "trace-2d8f44c1",
    },
  ],
  // Scenario C — assertion mismatch / element not found
  [
    {
      timestamp: generateTimestamp(30),
      level: "INFO",
      service: "content-service",
      message: "Fetching dashboard data for user#9032",
      traceId: "trace-9a12bc77",
    },
    {
      timestamp: generateTimestamp(28),
      level: "WARN",
      service: "feature-flags",
      message: "Flag 'new-dashboard-v2' is OFF for user#9032 — serving legacy layout",
      traceId: "trace-9a12bc77",
    },
    {
      timestamp: generateTimestamp(27),
      level: "INFO",
      service: "frontend",
      message:
        "Rendering legacy dashboard component (new-dashboard-v2 flag disabled)",
      traceId: "trace-9a12bc77",
    },
    {
      timestamp: generateTimestamp(25),
      level: "WARN",
      service: "frontend",
      message:
        "Element with data-testid='new-submit-button' not found — component version mismatch",
      traceId: "trace-9a12bc77",
    },
  ],
];

/**
 * Simulates calling the MCP `query_logs` tool against a Coralogix-like system.
 * Returns a realistic set of correlated log entries for the failure scenario.
 */
export async function mcpQueryLogs(
  _service?: string,
  _level?: string,
  _timeRange?: number
): Promise<McpLog[]> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, Math.random() * 800 + 400));

  const coralogixKey = process.env.CORALOGIX_API_KEY;

  if (coralogixKey) {
    // Real integration would go here — POST to CORALOGIX_ENDPOINT
    // For now, always fall back to mock even if key is present (it's a demo key)
  }

  // Pick a random scenario for variety in demos
  const scenario = MOCK_LOG_SCENARIOS[Math.floor(Math.random() * MOCK_LOG_SCENARIOS.length)];
  return scenario;
}

export async function mcpGetErrorTraces(
  _service?: string,
  limit = 5
): Promise<McpLog[]> {
  const allLogs = await mcpQueryLogs();
  return allLogs.filter((l) => l.level === "ERROR" || l.level === "WARN").slice(0, limit);
}
