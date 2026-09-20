import { useState } from "react";
import { Settings, Network, Server, CheckCircle2, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import Modal from "../ui/Modal";

interface McpConfigModalProps {
  open: boolean;
  onClose: () => void;
  hasCoralogix: boolean;
  onOpenSettings: () => void;
}

export default function McpConfigModal({
  open,
  onClose,
  hasCoralogix,
  onOpenSettings,
}: McpConfigModalProps) {
  const [mcpEnabled, setMcpEnabled] = useState(true);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="MCP Log Analysis Settings"
      icon={Network}
      iconClassName="text-indigo-400"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium bg-surface-700 hover:bg-surface-600 text-slate-200 rounded-lg"
        >
          Done
        </button>
      }
    >
      <p className="text-xs text-slate-400 leading-relaxed">
        Model Context Protocol (MCP) lets QA-Genius pull logs from external systems before AI analysis.
        When Coralogix is not configured, we analyze raw GitHub Actions failure logs instead.
      </p>

      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-surface-600 bg-surface-900/50 cursor-pointer">
        <div>
          <p className="text-sm text-slate-200">Enable MCP pipeline</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Use tool calls when external log sources are available</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mcpEnabled}
          onClick={() => setMcpEnabled((v) => !v)}
          className={clsx(
            "relative w-11 h-6 rounded-full transition-colors",
            mcpEnabled ? "bg-sky-600" : "bg-surface-600"
          )}
        >
          <span
            className={clsx(
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
              mcpEnabled && "translate-x-5"
            )}
          />
        </button>
      </label>

      <div className="rounded-xl border border-surface-600 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-violet-400" />
          <span className="text-sm text-slate-200">Coralogix integration</span>
        </div>
        {hasCoralogix ? (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Connected — MCP will fetch live production logs
          </p>
        ) : (
          <p className="text-xs text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Not configured — GitHub Actions logs will be used instead
          </p>
        )}
        <button
          type="button"
          onClick={() => { onClose(); onOpenSettings(); }}
          className="text-xs text-sky-400 hover:text-sky-300 underline"
        >
          Open Settings to add Coralogix API key
        </button>
      </div>
    </Modal>
  );
}

export function McpSettingsButton({ onClick, hasCoralogix }: { onClick: () => void; hasCoralogix?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Configure Coralogix MCP Integration"
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-surface-600 bg-surface-800 hover:bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors"
    >
      <Settings className="w-3.5 h-3.5" />
      <span className="text-[9px] font-bold uppercase tracking-wider">MCP</span>
      <span
        className={clsx(
          "w-1.5 h-1.5 rounded-full flex-shrink-0",
          hasCoralogix ? "bg-emerald-400" : "bg-amber-400"
        )}
        title={hasCoralogix ? "Coralogix connected" : "Coralogix not configured"}
      />
    </button>
  );
}
