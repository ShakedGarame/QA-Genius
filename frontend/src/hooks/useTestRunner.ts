import { useState, useCallback } from "react";
import { RunTestResult, FailureAnalysis, McpStep } from "../types";
import { buildOpenAIKeyHeaders } from "../lib/apiKeys";
import { executeTestRun } from "../lib/cloudRunner";

export function useTestRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<RunTestResult | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mcpSteps, setMcpSteps] = useState<McpStep[]>([]);
  const [analysis, setAnalysis] = useState<FailureAnalysis | null>(null);

  const runTest = useCallback(async (code: string) => {
    setIsRunning(true);
    setOutput("");
    setProgress(0);
    setResult(null);
    setAnalysis(null);
    setMcpSteps([]);

    try {
      await executeTestRun({ code }, {
        onStatus: (msg, pct) => {
          setStatusMessage(msg);
          setProgress(pct);
        },
        onOutputAppend: (chunk) => setOutput((prev) => prev + chunk),
        onOutputReplace: (text) => setOutput(text),
        onResult: (runResult) => setResult(runResult),
      });
    } catch (e) {
      setOutput(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setIsRunning(false);
      setStatusMessage("");
    }
  }, []);

  const analyzeFailure = useCallback(async (testCode: string, errorOutput: string) => {
    setIsAnalyzing(true);
    setMcpSteps([]);
    setAnalysis(null);

    try {
      const res = await fetch("/api/analyze-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildOpenAIKeyHeaders() },
        credentials: "include",
        body: JSON.stringify({ testCode, errorOutput }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const chunk of events) {
          const lines = chunk.split("\n");
          const eventType = lines.find((l) => l.startsWith("event:"))?.replace("event: ", "");
          const dataLine = lines.find((l) => l.startsWith("data:"))?.replace("data: ", "");

          if (!eventType || !dataLine) continue;

          try {
            const data = JSON.parse(dataLine);
            if (eventType === "mcp_step") {
              setMcpSteps((prev) => [...prev, data as McpStep]);
            } else if (eventType === "result") {
              setAnalysis(data as FailureAnalysis);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      console.error("Analysis failed:", e);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  return {
    isRunning,
    output,
    progress,
    statusMessage,
    result,
    runTest,
    isAnalyzing,
    mcpSteps,
    analysis,
    analyzeFailure,
  };
}
