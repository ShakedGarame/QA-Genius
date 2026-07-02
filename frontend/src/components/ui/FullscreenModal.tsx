import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";
import clsx from "clsx";

// ── useCopyText ───────────────────────────────────────────────────────────────

export function useCopyText() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { copied, copy };
}

// ── CopyButton ────────────────────────────────────────────────────────────────

interface CopyButtonProps {
  text: string;
  className?: string;
  /** Icon-only DevTools style — no label text */
  iconOnly?: boolean;
  title?: string;
}

export function CopyButton({ text, className, iconOnly = false, title }: CopyButtonProps) {
  const { copied, copy } = useCopyText();
  const tooltip = copied ? "Copied!" : (title ?? "Copy to clipboard");

  return (
    <button
      type="button"
      onClick={() => copy(text)}
      title={tooltip}
      aria-label={tooltip}
      className={clsx(
        iconOnly
          ? "p-1.5 rounded-md transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          : "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
        !iconOnly &&
          (copied
            ? "text-emerald-400 bg-emerald-500/10"
            : "text-slate-400 hover:text-slate-200 hover:bg-surface-700"),
        iconOnly && copied && "text-emerald-400",
        className
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {!iconOnly && <span>{copied ? "Copied!" : "Copy"}</span>}
    </button>
  );
}

// ── FullscreenModal ───────────────────────────────────────────────────────────

interface FullscreenModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Text to offer for copy (optional — omit for image lightboxes) */
  copyText?: string;
  children: React.ReactNode;
  /** Extra classes applied to the inner box (default: log viewer sizing) */
  innerClassName?: string;
}

export default function FullscreenModal({
  open,
  onClose,
  title,
  copyText,
  children,
  innerClassName,
}: FullscreenModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    // Overlay — clicking outside the inner box closes the modal
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Inner box — stop click propagation so clicking inside doesn't close */}
      <div
        className={clsx(
          "relative flex flex-col w-full sm:w-11/12 max-w-6xl h-[92vh] sm:h-[80vh]",
          "bg-slate-950 rounded-xl border border-slate-800 shadow-2xl",
          innerClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-mono text-slate-300 min-w-0 truncate">
            {title}
          </div>
          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
            {copyText !== undefined && <CopyButton text={copyText} />}
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="flex items-center gap-1 p-2 sm:px-2 sm:py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-surface-700 transition-colors"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
