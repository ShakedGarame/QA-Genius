import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: LucideIcon;
  /** Text color class for the header icon (default: text-sky-400). */
  iconClassName?: string;
  children: ReactNode;
  /** Optional footer row (e.g. action buttons), right-aligned with a top border. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Override the default padded/scrollable body — use for content that manages its own layout (e.g. a full-height table). */
  bodyClassName?: string;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-6xl h-[85vh]",
};

/** Shared centered dialog: consistent backdrop, header, Escape-to-close and
 * click-outside-to-close across every modal in the app (Showcase, MCP
 * settings, STD viewer, etc.) instead of each one reimplementing its own
 * overlay with slightly different z-index/opacity/close behavior. */
export default function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  iconClassName,
  children,
  footer,
  size = "md",
  bodyClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={clsx(
          "w-full bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl overflow-hidden flex flex-col",
          SIZE_CLASSES[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className={clsx("w-4 h-4 flex-shrink-0", iconClassName ?? "text-sky-400")} aria-hidden />}
            <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-700 text-slate-400 hover:text-white flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={clsx("min-h-0", bodyClassName ?? "px-5 py-5 space-y-4 overflow-y-auto")}>
          {children}
        </div>

        {footer && (
          <div className="px-5 py-3 border-t border-surface-600 bg-surface-900/40 flex justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
