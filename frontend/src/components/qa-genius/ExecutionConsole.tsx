import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle, Loader2, Terminal } from "lucide-react";
import clsx from "clsx";
import { RunTestResult } from "../../types";

interface Props {
  output: string;
  result: RunTestResult | null;
  isRunning: boolean;
  progress?: number;
  statusMessage?: string;
}

function colorize(line: string): string {
  if (/✓|passed|PASS/i.test(line)) return "text-emerald-400";
  if (/✗|failed|FAIL|error/i.test(line)) return "text-red-400";
  if (/warn/i.test(line)) return "text-yellow-400";
  if (/^\s+at\s/.test(line)) return "text-slate-500";
  if (/\d+\s+(passed|failed)/i.test(line)) return "text-slate-200 font-semibold";
  return "text-slate-300";
}

export default function ExecutionConsole({
  output,
  result,
  isRunning,
  progress = 0,
  statusMessage,
}: Props) {
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [output]);

  const lines = output.split("\n");

  return (
    <div className="h-full flex flex-col bg-surface-900 rounded-lg border border-surface-600 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-800 border-b border-surface-600">
        <Terminal className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-400 font-mono">Terminal — Playwright Output</span>
        <div className="ml-auto flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-sky-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {statusMessage ?? "RUNNING"}
            </span>
          )}
          {result && !isRunning && result.status !== "running" && (
            <span
              className={clsx(
                "flex items-center gap-1 text-xs font-semibold",
                result.status === "passed" ? "text-emerald-400" : "text-red-400"
              )}
            >
              {result.status === "passed" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {result.status === "passed" ? "PASSED" : "FAILED"}
              {result.duration > 0 && (
                <span className="text-slate-500 font-normal ml-1">
                  ({(result.duration / 1000).toFixed(1)}s)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isRunning && progress > 0 && (
        <div className="h-0.5 bg-surface-700">
          <div
            className="h-full bg-sky-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Console output */}
      <div
        ref={consoleRef}
        className="flex-1 overflow-auto p-4 font-mono text-xs leading-5"
      >
        {output ? (
          lines.map((line, i) => (
            <div key={i} className={colorize(line)}>
              {line || "\u00A0"}
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm font-sans">
            {isRunning ? "Waiting for output…" : "Run a test to see output here"}
          </div>
        )}

        {isRunning && (
          <div className="mt-1 flex items-center gap-1.5 text-sky-400">
            <span className="inline-block w-2 h-3 bg-sky-400 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
