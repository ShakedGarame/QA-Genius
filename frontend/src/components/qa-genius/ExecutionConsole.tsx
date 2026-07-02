import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Maximize2, Terminal, XCircle } from "lucide-react";
import clsx from "clsx";
import { RunTestResult } from "../../types";
import FullscreenModal, { CopyButton } from "../ui/FullscreenModal";
import { formatDuration } from "../../lib/formatDuration";

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

function LogLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <div key={i} className={colorize(line)}>
          {line || "\u00A0"}
        </div>
      ))}
    </>
  );
}

export default function ExecutionConsole({
  output,
  result,
  isRunning,
  progress = 0,
  statusMessage,
}: Props) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [output]);

  const statusBadge = result && !isRunning && result.status !== "running" && (
    <span
      className={clsx(
        "flex items-center gap-1 text-xs font-semibold flex-shrink-0",
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
          ({formatDuration(result.duration)})
        </span>
      )}
    </span>
  );

  return (
    <>
      <div className="h-full flex flex-col bg-surface-900 rounded-lg border border-surface-600 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-800/40 border-b border-surface-600 min-h-[44px] min-w-0">
          <div className="flex items-center gap-2 min-w-0 shrink">
            <Terminal className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-400 font-mono truncate">
              Terminal — Playwright Output
            </span>
          </div>

          {isRunning && statusMessage && (
            <span className="flex items-center gap-1.5 text-xs text-sky-400 min-w-0 flex-1 justify-end sm:justify-center truncate px-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              <span className="truncate">{statusMessage}</span>
            </span>
          )}

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto pl-2 pr-1">
            {statusBadge}

            {output && (
              <>
                <CopyButton text={output} iconOnly title="Copy Logs" />
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  title="Expand to Full Screen"
                  aria-label="Expand to Full Screen"
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </>
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
            <LogLines text={output} />
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

      {/* Fullscreen modal */}
      <FullscreenModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title={
          <span className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            Terminal — Playwright Output
            {statusBadge && <span className="ml-2">{statusBadge}</span>}
          </span>
        }
        copyText={output}
      >
        {output ? (
          <LogLines text={output} />
        ) : (
          <span className="text-slate-600">No output yet.</span>
        )}
      </FullscreenModal>
    </>
  );
}
