import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Server,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Wrench,
  Info,
  Network,
} from "lucide-react";
import clsx from "clsx";
import { FailureAnalysis, McpLog, McpStep } from "../../types";
import McpConfigModal, { McpSettingsButton } from "./McpConfigModal";

interface Props {
  errorDetails: string;
  failureLog: string;
  testCode: string;
  hasCoralogix: boolean;
  onAnalyze: () => void;
  onAnalyzeWithGitHubLogs: () => void;
  onOpenSettings: () => void;
  isAnalyzing: boolean;
  mcpSteps: McpStep[];
  analysis: FailureAnalysis | null;
}

function LogLevelBadge({ level }: { level: McpLog["level"] }) {
  const colors: Record<McpLog["level"], string> = {
    ERROR: "bg-red-500/20 text-red-400 border border-red-500/30",
    WARN: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    INFO: "bg-sky-500/20 text-sky-400 border border-sky-500/30",
    DEBUG: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
  };
  return (
    <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase", colors[level])}>
      {level}
    </span>
  );
}

export default function FailureAnalyzer({
  errorDetails,
  failureLog,
  testCode: _testCode,
  hasCoralogix,
  onAnalyze,
  onAnalyzeWithGitHubLogs,
  onOpenSettings,
  isAnalyzing,
  mcpSteps,
  analysis,
}: Props) {
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);

  const handlePrimaryAction = () => {
    if (hasCoralogix) {
      onAnalyze();
    } else {
      onAnalyzeWithGitHubLogs();
    }
  };

  return (
    <>
      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-red-500/20 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-300">Test Failed</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {hasCoralogix
                  ? "Fetch Coralogix logs via MCP and get an AI root-cause analysis"
                  : "Analyze the GitHub Actions failure log with AI in the Log Analyzer tab"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <McpSettingsButton onClick={() => setMcpModalOpen(true)} hasCoralogix={hasCoralogix} />
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium shadow-lg transition-all"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BrainCircuit className="w-4 h-4" />
              )}
              {isAnalyzing ? "Analyzing…" : "Explain Failure & Analyze Logs"}
            </button>
          </div>
        </div>

        <div className="px-5 py-3 bg-surface-900/50">
          <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap line-clamp-6 max-h-40 overflow-y-auto">
            {errorDetails || failureLog.slice(0, 1200)}
          </pre>
        </div>

        {mcpSteps.length > 0 && (
          <div className="px-5 py-4 border-t border-surface-600 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Network className="w-4 h-4 text-indigo-400" />
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                MCP Tool Calls
              </p>
            </div>
            {mcpSteps.map((step) => (
              <div key={step.step} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
                  <span className="text-[10px] text-indigo-400 font-bold">{step.step}</span>
                </div>
                <div>
                  <p className="text-xs text-slate-300">{step.message}</p>
                  <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                    tool: {step.tool}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {analysis && (
          <div className="border-t border-surface-600 p-5 space-y-5 animate-fade-in">
            <div className="rounded-lg bg-surface-800 border border-surface-600 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <p className="text-xs font-bold text-orange-300 uppercase tracking-wider">Root Cause</p>
                {analysis.isMock && (
                  <span className="ml-auto text-[10px] text-slate-500 bg-surface-700 px-2 py-0.5 rounded">
                    Mock Mode
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-100 font-medium">{analysis.rootCause}</p>
            </div>

            <div className="rounded-lg bg-surface-800 border border-surface-600 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-sky-400" />
                <p className="text-xs font-bold text-sky-300 uppercase tracking-wider">Explanation</p>
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                {analysis.explanation}
              </p>
            </div>

            <div className="rounded-lg bg-surface-800 border border-emerald-500/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Suggested Fix</p>
              </div>
              <pre className="text-sm text-emerald-200 whitespace-pre-wrap font-mono leading-relaxed">
                {analysis.suggestedFix}
              </pre>
            </div>

            {analysis.logs.length > 0 && (
              <div className="rounded-lg bg-surface-900 border border-surface-600 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLogsExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-300">
                      Coralogix Logs ({analysis.logs.length} entries)
                    </p>
                  </div>
                  {logsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {logsExpanded && (
                  <div className="border-t border-surface-600 p-3 space-y-2 max-h-64 overflow-y-auto animate-fade-in">
                    {analysis.logs.map((log, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs font-mono">
                        <span className="text-slate-600 flex-shrink-0 pt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <LogLevelBadge level={log.level} />
                        <span className="text-sky-400/80 flex-shrink-0">[{log.service}]</span>
                        <span
                          className={
                            log.level === "ERROR"
                              ? "text-red-300"
                              : log.level === "WARN"
                              ? "text-yellow-300"
                              : "text-slate-300"
                          }
                        >
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <McpConfigModal
        open={mcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
        hasCoralogix={hasCoralogix}
        onOpenSettings={onOpenSettings}
      />
    </>
  );
}
