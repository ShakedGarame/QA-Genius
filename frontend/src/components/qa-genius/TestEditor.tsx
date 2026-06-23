import Editor from "@monaco-editor/react";
import { Copy, Download, CheckCheck } from "lucide-react";
import { useState } from "react";

interface Props {
  code: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  fileName?: string;
}

export default function TestEditor({ code, onChange, readOnly = false, fileName = "generated.spec.ts" }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-surface-900 rounded-lg overflow-hidden border border-surface-600">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-800 border-b border-surface-600">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-slate-400 font-mono ml-2">{fileName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="p-1.5 rounded hover:bg-surface-600 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDownload}
            title="Download file"
            className="p-1.5 rounded hover:bg-surface-600 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Download className="w-4 h-4" />
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
