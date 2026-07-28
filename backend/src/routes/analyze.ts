import { Router, Request, Response } from "express";
import { analyzeFailure, analyzeRawLogs } from "../services/llm.js";
import { mcpQueryLogs, mcpGetErrorTraces, AVAILABLE_TOOLS } from "../mcp/coralogix-server.js";
import { AnalyzeFailureRequest } from "../types/index.js";
import { getUserSettings, saveLogAnalysis } from "../db.js";
import type { DbUser } from "../db.js";
import { extractOpenAIKeyFromRequest } from "../lib/requestKeys.js";
import { fetchCoralogixLogs, resolveCoralogixConfig } from "../lib/coralogix.js";

const router = Router();

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/mcp/tools — expose available MCP tool definitions
router.get("/mcp/tools", (_req, res: Response) => {
  res.json({
    protocol: "MCP (Model Context Protocol)",
    version: "0.1.0",
    server: "qa-genius-coralogix-simulator",
    tools: AVAILABLE_TOOLS,
  });
});

// POST /api/analyze-failure — Playwright failure + MCP/Coralogix logs + AI analysis
router.post("/analyze-failure", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const userSettings = await getUserSettings(userId);
  const { apiKey: coralogixKey, region } = resolveCoralogixConfig(userSettings);
  const llmOptions = { openaiKey: extractOpenAIKeyFromRequest(req, userSettings) };

  const { testCode, errorOutput, featureName } = req.body as AnalyzeFailureRequest;

  if (!errorOutput || typeof errorOutput !== "string") {
    return res.status(400).json({ error: "errorOutput is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let logs;

    if (coralogixKey) {
      // ── Real Coralogix fetch ──────────────────────────────────────────────
      sendEvent("mcp_step", {
        step: 1,
        tool: "coralogix_live",
        message: `🔍 Fetching live logs from Coralogix (${region} region)…`,
      });

      try {
        const rawLogs = await fetchCoralogixLogs(coralogixKey, region, "severity:ERROR OR severity:WARN", 30);
        logs = rawLogs.split("\n").map((line) => ({
          timestamp: new Date().toISOString(),
          level: "ERROR" as const,
          service: "coralogix-live",
          message: line,
          traceId: undefined,
          statusCode: undefined,
        }));
        sendEvent("mcp_step", {
          step: 2,
          tool: "coralogix_live",
          message: `📋 Retrieved ${logs.length} live log entries from Coralogix. Analyzing…`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Coralogix fetch failed";
        sendEvent("mcp_step", {
          step: 2,
          tool: "coralogix_fallback",
          message: `⚠️ Live fetch failed (${msg}). Falling back to simulated logs…`,
        });
        logs = await mcpQueryLogs("all", "ALL", 15);
      }
    } else {
      // ── Simulated MCP logs (no Coralogix key) ────────────────────────────
      sendEvent("mcp_step", {
        step: 1,
        tool: "query_logs",
        message: "🔍 Calling MCP tool: query_logs (Coralogix simulator)…",
      });
      await new Promise((r) => setTimeout(r, 400));
      logs = await mcpQueryLogs("all", "ALL", 15);

      sendEvent("mcp_step", {
        step: 2,
        tool: "get_error_traces",
        message: `📋 Retrieved ${logs.length} log entries. Calling get_error_traces…`,
      });
      await new Promise((r) => setTimeout(r, 300));
      const errorTraces = await mcpGetErrorTraces("all", 5);
      logs = [...logs, ...errorTraces].filter(
        (l, idx, self) => self.findIndex((x) => x.timestamp === l.timestamp) === idx
      );
    }

    sendEvent("mcp_step", {
      step: 3,
      tool: "analyze",
      message: `🤖 Sending combined context to AI for root-cause analysis…`,
      logCount: logs.length,
    });

    const result = await analyzeFailure(testCode ?? "", errorOutput, logs, llmOptions);

    const saved = await saveLogAnalysis(userId, {
      source: "playwright-failure",
      featureName,
      rawLogs: errorOutput,
      rootCause: result.rootCause,
      explanation: result.explanation,
      suggestedFix: result.suggestedFix,
      severity: "high",
      category: "test-failure",
      isMock: result.isMock,
    });

    sendEvent("result", result);
    sendEvent("done", { message: "Analysis complete", analysisId: saved.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analysis error";
    sendEvent("error", { message });
  } finally {
    res.end();
  }
});

// ── POST /api/analyze-logs — Standalone log analysis (Tab 3) ─────────────────
interface AnalyzeLogsRequest {
  rawLogs: string;
  source: string;
  featureName?: string;
}

router.post("/analyze-logs", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const userSettings = await getUserSettings(userId);
  const { apiKey: coralogixKey, region } = resolveCoralogixConfig(userSettings);
  const llmOptions = { openaiKey: extractOpenAIKeyFromRequest(req, userSettings) };

  const { rawLogs, source, featureName } = req.body as AnalyzeLogsRequest;

  if (!rawLogs || typeof rawLogs !== "string" || rawLogs.trim().length < 5) {
    return res.status(400).json({ error: "rawLogs is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let logsToAnalyze = rawLogs;

    // If source is Coralogix and user has a key, try to fetch live logs as context
    if (source.toLowerCase().includes("coralogix") && coralogixKey) {
      sendEvent("status", { message: `🔍 Fetching live logs from Coralogix (${region})…`, progress: 20 });
      try {
        const liveLogs = await fetchCoralogixLogs(coralogixKey, region, rawLogs.slice(0, 200), 30);
        logsToAnalyze = `# User-Provided Context\n${rawLogs}\n\n# Live Coralogix Logs (last 30 min)\n${liveLogs}`;
        sendEvent("status", { message: "✅ Live logs fetched. Sending to AI…", progress: 50 });
      } catch {
        sendEvent("status", { message: "⚠️ Live fetch unavailable — analyzing provided text…", progress: 40 });
      }
    } else {
      sendEvent("status", { message: `🔍 Analyzing ${source ?? "logs"}…`, progress: 20 });
      await new Promise((r) => setTimeout(r, 300));
      sendEvent("status", { message: "🤖 Sending to AI engine…", progress: 60 });
    }

    const result = await analyzeRawLogs(logsToAnalyze, source ?? "unknown", llmOptions);

    const saved = await saveLogAnalysis(userId, {
      source: source ?? "unknown",
      featureName,
      rawLogs: rawLogs.trim(),
      rootCause: result.rootCause,
      explanation: result.explanation,
      suggestedFix: result.suggestedFix,
      severity: result.severity,
      category: result.category,
      isMock: result.isMock,
    });

    sendEvent("result", result);
    sendEvent("done", { message: "Analysis complete", analysisId: saved.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analysis error";
    sendEvent("error", { message });
  } finally {
    res.end();
  }
});

export default router;
