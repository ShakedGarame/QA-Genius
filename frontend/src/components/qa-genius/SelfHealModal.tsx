import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileCode2,
  Loader2,
  Save,
  Sparkles,
  X,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import { CopyButton } from "../ui/FullscreenModal";
import { buildOpenAIKeyHeaders } from "../../lib/apiKeys";

// ── Line-diff (LCS-based, aligns unchanged lines across both panels) ─────────

type DiffRowType = "equal" | "delete" | "insert";

interface DiffRow {
  type: DiffRowType;
  leftLine: string | null;
  leftLineNo: number | null;
  rightLine: string | null;
  rightLineNo: number | null;
}

/** Above this many cells, the O(n*m) LCS table gets expensive — fall back to a flat diff. */
const LCS_CELL_BUDGET = 400_000;

function diffLinesFlat(original: string[], healed: string[]): DiffRow[] {
  const maxLen = Math.max(original.length, healed.length);
  const rows: DiffRow[] = [];
  for (let i = 0; i < maxLen; i++) {
    const left = i < original.length ? original[i] : null;
    const right = i < healed.length ? healed[i] : null;
    if (left !== null && left === right) {
      rows.push({ type: "equal", leftLine: left, leftLineNo: i, rightLine: right, rightLineNo: i });
    } else {
      rows.push({ type: left !== null ? "delete" : "insert", leftLine: left, leftLineNo: left !== null ? i : null, rightLine: right, rightLineNo: right !== null ? i : null });
    }
  }
  return rows;
}

function computeLineDiff(original: string[], healed: string[]): DiffRow[] {
  const n = original.length;
  const m = healed.length;

  if (n * m > LCS_CELL_BUDGET) {
    return diffLinesFlat(original, healed);
  }

  // Classic LCS DP table, walked backward to recover the edit script.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = original[i] === healed[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (original[i] === healed[j]) {
      rows.push({ type: "equal", leftLine: original[i], leftLineNo: i, rightLine: healed[j], rightLineNo: j });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "delete", leftLine: original[i], leftLineNo: i, rightLine: null, rightLineNo: null });
      i++;
    } else {
      rows.push({ type: "insert", leftLine: null, leftLineNo: null, rightLine: healed[j], rightLineNo: j });
      j++;
    }
  }
  while (i < n) {
    rows.push({ type: "delete", leftLine: original[i], leftLineNo: i, rightLine: null, rightLineNo: null });
    i++;
  }
  while (j < m) {
    rows.push({ type: "insert", leftLine: null, leftLineNo: null, rightLine: healed[j], rightLineNo: j });
    j++;
  }
  return rows;
}

/** Group consecutive non-equal rows into navigable diff hunks. */
function computeChangeHunks(rows: DiffRow[]): { startRow: number; endRow: number }[] {
  const hunks: { startRow: number; endRow: number }[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].type !== "equal") {
      const start = i;
      while (i < rows.length && rows[i].type !== "equal") i++;
      hunks.push({ startRow: start, endRow: i - 1 });
    } else {
      i++;
    }
  }
  return hunks;
}

// ── Code panel ────────────────────────────────────────────────────────────────

function CodePanel({
  rows,
  title,
  side,
  scrollContainerRef,
  onScroll,
}: {
  rows: DiffRow[];
  title: string;
  side: "left" | "right";
  scrollContainerRef: { current: HTMLDivElement | null };
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
  const rowBg = side === "left" ? "bg-red-950/40" : "bg-green-950/40";
  const gutterText = side === "left" ? "text-red-400" : "text-green-400";
  const borderColor = side === "left" ? "border-red-500/70" : "border-green-500/70";
  const highlightType: DiffRowType = side === "left" ? "delete" : "insert";

  const changedCount = rows.filter((r) => r.type === highlightType).length;

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-surface-600 bg-surface-800/60">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {changedCount > 0 && (
          <span className="text-[10px] text-slate-600">
            · {changedCount} line{changedCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div
        className="flex-1 overflow-auto"
        ref={scrollContainerRef as React.RefObject<HTMLDivElement>}
        onScroll={onScroll}
      >
        <table className="w-full border-collapse font-mono text-[12px] leading-5">
          <tbody>
            {rows.map((row, rowIdx) => {
              const lineNo = side === "left" ? row.leftLineNo : row.rightLineNo;
              const lineText = side === "left" ? row.leftLine : row.rightLine;
              const isHighlighted = row.type === highlightType;
              const isFiller = lineText === null;

              return (
                <tr
                  key={rowIdx}
                  data-row={rowIdx}
                  className={clsx(
                    !isFiller && "hover:bg-slate-800/20",
                    isHighlighted && rowBg,
                    isFiller && "bg-surface-900/30"
                  )}
                >
                  <td
                    className={clsx(
                      "select-none text-right px-2 py-0 w-10 text-[11px]",
                      isHighlighted
                        ? `${gutterText} border-l-2 ${borderColor} border-r border-surface-600/40`
                        : "text-slate-700 border-r border-surface-600/40"
                    )}
                  >
                    {lineNo !== null ? lineNo + 1 : ""}
                  </td>
                  <td className="px-3 py-0 whitespace-pre text-slate-200 w-full">
                    {isFiller ? " " : (lineText || " ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SelfHealModalProps {
  open: boolean;
  onClose: () => void;
  testCode: string;
  errorOutput: string;
  rootCause?: string;
  suggestedFix?: string;
  featureSlug?: string;
  fileName?: string;
  onSaved?: () => void;
}

interface HealResult {
  healedCode: string;
  model: string;
  isMock: boolean;
}

export default function SelfHealModal({
  open,
  onClose,
  testCode,
  errorOutput,
  rootCause,
  suggestedFix,
  featureSlug,
  fileName,
  onSaved,
}: SelfHealModalProps) {
  const [isHealing, setIsHealing] = useState(false);
  const [healResult, setHealResult] = useState<HealResult | null>(null);
  const [healError, setHealError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [currentChangeIdx, setCurrentChangeIdx] = useState(0);

  const fetchedRef = useRef(false);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);

  // Auto-trigger heal on open
  useEffect(() => {
    if (!open) {
      fetchedRef.current = false;
      setHealResult(null);
      setHealError(null);
      setSaveStatus("idle");
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    setIsHealing(true);
    setHealError(null);

    fetch("/api/tests/self-heal", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildOpenAIKeyHeaders() },
      credentials: "include",
      body: JSON.stringify({ testCode, errorOutput, rootCause, suggestedFix }),
    })
      .then(async (res) => {
        const data = await res.json() as { healedCode?: string; model?: string; isMock?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Self-heal request failed");
        setHealResult({
          healedCode: data.healedCode ?? testCode,
          model: data.model ?? "unknown",
          isMock: data.isMock ?? false,
        });
      })
      .catch((err: unknown) => {
        setHealError(err instanceof Error ? err.message : "Self-heal failed");
      })
      .finally(() => setIsHealing(false));
  }, [open, testCode, errorOutput, rootCause, suggestedFix]);

  // Reset navigator to first change whenever a new diff lands
  useEffect(() => {
    setCurrentChangeIdx(0);
  }, [healResult]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSave = useCallback(async () => {
    if (!healResult || !featureSlug || !fileName) return;
    setSaveStatus("saving");

    try {
      const res = await fetch(
        `/api/tests/${encodeURIComponent(featureSlug)}/${encodeURIComponent(fileName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...buildOpenAIKeyHeaders() },
          credentials: "include",
          body: JSON.stringify({ code: healResult.healedCode }),
        }
      );
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaveStatus("saved");
      onSaved?.();
      window.dispatchEvent(new CustomEvent("qa-genius:repository-changed"));
    } catch (err: unknown) {
      setSaveStatus("error");
      console.error("[self-heal] save failed:", err);
    }
  }, [healResult, featureSlug, fileName, onSaved]);

  // Diff computation is O(n*m) — only recompute when the underlying text changes,
  // not on every render (e.g. save-status or change-navigator updates).
  const healedCodeForDiff = healResult?.healedCode;
  const diffRows = useMemo(() => {
    const origLines = testCode.split("\n");
    const healedLines = healedCodeForDiff?.split("\n") ?? [];
    return computeLineDiff(origLines, healedLines);
  }, [testCode, healedCodeForDiff]);
  const changeHunks = useMemo(() => computeChangeHunks(diffRows), [diffRows]);

  if (!open) return null;
  const changedCount = Math.max(
    diffRows.filter((r) => r.type === "delete").length,
    diffRows.filter((r) => r.type === "insert").length
  );

  const navigateChange = (direction: "prev" | "next") => {
    if (changeHunks.length === 0) return;
    const newIdx =
      direction === "next"
        ? (currentChangeIdx + 1) % changeHunks.length
        : (currentChangeIdx - 1 + changeHunks.length) % changeHunks.length;
    setCurrentChangeIdx(newIdx);

    const targetRow = changeHunks[newIdx].startRow;
    for (const ref of [leftScrollRef, rightScrollRef]) {
      const container = ref.current;
      if (!container) continue;
      const row = container.querySelector(`tr[data-row="${targetRow}"]`);
      if (row) (row as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const canSave = Boolean(featureSlug && fileName);
  const showNavigation = Boolean(healResult && !isHealing && changeHunks.length > 0);

  // Keep both panels scrolled to the same row so aligned lines stay aligned visually.
  const handlePanelScroll = (source: "left" | "right") => (e: React.UIEvent<HTMLDivElement>) => {
    if (syncingScrollRef.current) return;
    const target = (source === "left" ? rightScrollRef : leftScrollRef).current;
    if (!target) return;
    syncingScrollRef.current = true;
    target.scrollTop = e.currentTarget.scrollTop;
    syncingScrollRef.current = false;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-11/12 max-w-7xl h-[88vh] bg-slate-950 rounded-xl border border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-200">Self-Heal Test Code</span>
              {fileName && (
                <span className="text-[11px] text-slate-500 font-mono bg-surface-700 px-2 py-0.5 rounded">
                  {fileName}
                </span>
              )}
              {healResult && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-surface-700 px-2 py-0.5 rounded border border-surface-500">
                  <Cpu className="w-3 h-3" />
                  {healResult.model}
                </span>
              )}
              {healResult?.isMock && (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                  MOCK MODE
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Change navigator */}
            {showNavigation && (
              <div className="flex items-center gap-0.5 bg-surface-800 border border-surface-600 rounded-lg px-1 py-0.5">
                <button
                  onClick={() => navigateChange("prev")}
                  title="Previous change (↑)"
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-surface-700 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-slate-400 tabular-nums px-1.5 min-w-[70px] text-center">
                  {currentChangeIdx + 1} of {changeHunks.length} changes
                </span>
                <button
                  onClick={() => navigateChange("next")}
                  title="Next change (↓)"
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-surface-700 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {healResult && !isHealing && (
              <CopyButton text={healResult.healedCode} />
            )}
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-surface-700 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Loading */}
          {isHealing && (
            <div className="flex-1 flex items-center justify-center flex-col gap-4 p-8">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">AI is rewriting the broken lines…</p>
                <p className="text-xs text-slate-600 mt-1">
                  Applying minimum fix · preserving all passing tests
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {healError && !isHealing && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm font-semibold text-red-300">Self-Heal Failed</p>
                <p className="text-xs text-slate-400">{healError}</p>
                <p className="text-[10px] text-slate-600 mt-1">
                  Ensure an OpenAI or Anthropic API key is configured in Settings.
                </p>
              </div>
            </div>
          )}

          {/* Side-by-side diff — both panels share one row sequence, so unchanged lines stay aligned */}
          {healResult && !isHealing && (
            <div className="flex flex-1 min-h-0 divide-x divide-surface-600">
              <CodePanel
                rows={diffRows}
                title="Original (Failing)"
                side="left"
                scrollContainerRef={leftScrollRef}
                onScroll={handlePanelScroll("left")}
              />
              <CodePanel
                rows={diffRows}
                title="Healed Version"
                side="right"
                scrollContainerRef={rightScrollRef}
                onScroll={handlePanelScroll("right")}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {healResult && !isHealing && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-surface-900/40 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FileCode2 className="w-3.5 h-3.5 flex-shrink-0" />
              {changedCount > 0 ? (
                <span>
                  <span className="text-slate-300 font-medium">{changedCount}</span>{" "}
                  line{changedCount !== 1 ? "s" : ""} modified
                </span>
              ) : (
                <span className="text-slate-600">No line changes detected — code may already be valid</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {!canSave && (
                <span className="text-[10px] text-slate-600 italic">
                  Load from Repository tab to enable saving
                </span>
              )}
              {canSave && (
                <button
                  onClick={() => void handleSave()}
                  disabled={saveStatus === "saving" || saveStatus === "saved"}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-lg",
                    saveStatus === "saved"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                      : saveStatus === "saving"
                      ? "bg-sky-600/50 text-sky-300 cursor-wait"
                      : saveStatus === "error"
                      ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 cursor-pointer"
                      : "bg-sky-600 hover:bg-sky-500 text-white"
                  )}
                >
                  {saveStatus === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saveStatus === "saved" && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {(saveStatus === "idle" || saveStatus === "error") && (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saveStatus === "saving" && "Saving…"}
                  {saveStatus === "saved" && "Saved to Repository"}
                  {saveStatus === "error" && "Save Failed — Retry"}
                  {saveStatus === "idle" && "Accept & Save to Repository"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
