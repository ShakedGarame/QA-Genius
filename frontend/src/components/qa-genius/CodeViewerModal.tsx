import { useEffect, useState } from "react";
import { FileCode2 } from "lucide-react";
import Modal from "../ui/Modal";
import { CopyButton, Skeleton } from "../ui/layout";
import { MOCK_CODE_MAP } from "../../data/mockData";
import type { TestFileInfo } from "../../types";

export async function fetchTestCode(file: TestFileInfo, isMock: boolean): Promise<string> {
  if (isMock) return MOCK_CODE_MAP[file.relativePath] ?? "// Sample code not found";
  try {
    const res = await fetch(
      `/api/tests/${encodeURIComponent(file.featureSlug)}/${encodeURIComponent(file.fileName)}`,
      { credentials: "include" }
    );
    const d = await res.json();
    return d.code ?? "// Failed to load";
  } catch {
    return "// Failed to load test code";
  }
}

/** Read-only source preview for a saved test file — shared by Test Repository
 * and History so both get the same loading skeleton, line numbers and copy. */
export default function CodeViewerModal({
  file,
  isMock,
  onClose,
}: {
  file: TestFileInfo;
  isMock: boolean;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCode(null);
    void fetchTestCode(file, isMock).then((c) => { if (!cancelled) setCode(c); });
    return () => { cancelled = true; };
  }, [file, isMock]);

  const lines = code?.split("\n") ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      icon={FileCode2}
      iconClassName="text-slate-400"
      title={<span className="font-mono font-medium">{file.relativePath}</span>}
      size="xl"
      bodyClassName="flex-1 min-h-0 flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 pl-5 pr-3 h-9 border-b border-surface-700 bg-surface-900/40 flex-shrink-0">
        <span className="text-[11px] text-slate-500 tabular-nums">
          {code === null ? "Loading…" : `${lines.length} lines · TypeScript`}
        </span>
        {code !== null && <CopyButton text={code} label="Copy code" showLabel />}
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-surface-900">
        {code === null ? (
          <div className="p-5 space-y-2.5" role="status" aria-label="Loading code">
            {[72, 48, 64, 36, 80, 52, 40, 68].map((w, i) => (
              <div key={i} style={{ width: `${w}%` }}>
                <Skeleton className="h-3" />
              </div>
            ))}
          </div>
        ) : (
          <pre className="py-4 text-xs font-mono leading-5 text-slate-300">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none w-12 pr-4 text-right text-slate-600 tabular-nums flex-shrink-0">{i + 1}</span>
                <span className="whitespace-pre-wrap break-words pr-5 min-w-0">{line || " "}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </Modal>
  );
}
