import { useState, useCallback, useRef } from "react";
import { RunTestResult, FailureAnalysis, McpStep } from "../types";
import { buildOpenAIKeyHeaders } from "../lib/apiKeys";
import { executeTestRun } from "../lib/cloudRunner";

export type RunTestInput =
  | string
  | { code: string; relativePath?: string };

export function useTestRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<RunTestResult | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mcpSteps, setMcpSteps] = useState<McpStep[]>([]);
  const [analysis, setAnalysis] = useState<FailureAnalysis | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const resetExecutionState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setOutput("");
    setProgress(0);
    setStatusMessage("");
    setResult(null);
    setAnalysis(null);
    setMcpSteps([]);
    setIsAnalyzing(false);
  }, []);

  const stopTest = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runTest = useCallback(async (input: RunTestInput) => {
    const body =
      typeof input === "string"
        ? { code: input }
        : {
            code: input.code,
            ...(input.relativePath ? { relativePath: input.relativePath } : {}),
          };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setOutput("");
    setProgress(0);
    setResult(null);
    setAnalysis(null);
    setMcpSteps([]);

    try {
      const runResult = await executeTestRun(
        body,
        {
          onStatus: (msg, pct) => {
            setStatusMessage(msg);
            setProgress(pct);
          },
          onOutputAppend: (chunk) => setOutput((prev) => prev + chunk),
          onOutputReplace: (text) => setOutput(text),
          onResult: (next) => setResult(next),
        },
        { signal: controller.signal }
      );

      if (controller.signal.aborted) {
        setOutput((prev) =>
          prev.includes("stopped by user") ? prev : `${prev}\n\n⏹ Run stopped by user.\n`
        );
        setResult((prev) =>
          prev ?? {
            testId: "cancelled",
            status: "failed",
            output: "Run stopped by user.",
            duration: 0,
          }
        );
      } else if (runResult) {
        setResult(runResult);
      }
    } catch (e) {
      if (controller.signal.aborted) {
        setOutput((prev) => `${prev}\n\n⏹ Run stopped by user.\n`);
      } else {
        setOutput(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsRunning(false);
      setStatusMessage("");
    }
  }, []);

  const analyzeFailure = useCallback(async (testCode: string, errorOutput: string, featureName?: string) => {
    setIsAnalyzing(true);
    setMcpSteps([]);
    setAnalysis(null);

    try {
      const res = await fetch("/api/analyze-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildOpenAIKeyHeaders() },
        credentials: "include",
        body: JSON.stringify({ testCode, errorOutput, featureName }),
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
    stopTest,
    resetExecutionState,
    isAnalyzing,
    mcpSteps,
    analysis,
    analyzeFailure,
  };
}
