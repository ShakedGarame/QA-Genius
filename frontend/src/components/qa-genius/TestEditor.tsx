import Editor from "@monaco-editor/react";
import { Copy, Download, CheckCheck } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

interface Props {
  code: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  fileName?: string;
}

export default function TestEditor({ code, onChange, readOnly = false, fileName = "generated.spec.ts" }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers / non-HTTPS
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.endsWith(".ts") ? fileName : `${fileName}.spec.ts`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full min-w-0 flex flex-col bg-surface-900 rounded-lg overflow-hidden border border-surface-600">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-800 border-b border-surface-600 min-h-[44px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex gap-1.5 flex-shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-slate-400 font-mono truncate" title={fileName}>
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy test code to clipboard"
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors",
              copied
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-surface-700 text-slate-300 border-surface-600 hover:bg-surface-600 hover:text-white"
            )}
          >
            {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title="Download test file"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface-700 text-slate-300 border border-surface-600 hover:bg-surface-600 hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="typescript"
          value={code}
          onChange={(val) => onChange?.(val ?? "")}
          options={{
            readOnly,
            theme: "vs-dark",
            fontSize: 13,
            lineNumbers: "on",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 12, bottom: 12 },
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            renderLineHighlight: "gutter",
            smoothScrolling: true,
            cursorBlinking: "smooth",
          }}
          loading={
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Loading editor…
            </div>
          }
        />
      </div>
    </div>
  );
}
