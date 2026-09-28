import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { CopyButton as BaseCopyButton, FOCUS_RING } from "./layout";

// ── CopyButton ────────────────────────────────────────────────────────────────

interface CopyButtonProps {
  text: string;
  className?: string;
  /** Icon-only DevTools style — no label text */
  iconOnly?: boolean;
  title?: string;
}

/** Back-compat adapter over the shared CopyButton in ./layout. */
export function CopyButton({ text, className, iconOnly = false, title }: CopyButtonProps) {
  return <BaseCopyButton text={text} label={title ?? "Copy"} showLabel={!iconOnly} className={className} />;
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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] animate-fade-in"
      onClick={onClose}
    >
      {/* Inner box — stop click propagation so clicking inside doesn't close */}
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          "relative flex flex-col w-full sm:w-11/12 max-w-6xl h-[92vh] sm:h-[80vh] animate-pop-in",
          "bg-surface-900 rounded-xl border border-surface-600/80 shadow-2xl shadow-black/50",
          innerClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between pl-5 pr-3 h-12 border-b border-surface-700 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-mono text-slate-300 min-w-0 truncate">
            {title}
          </div>
          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
            {copyText !== undefined && <CopyButton text={copyText} />}
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close"
              className={clsx("pressable flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-surface-700", FOCUS_RING)}
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
