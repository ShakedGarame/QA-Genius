import React, { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Copy, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { toast } from "sonner";

// Shared focus ring for buttons/tabs — keyboard-only, same everywhere.
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900";

// Shared field treatment — mouse focus still needs an indicator on inputs,
// so this uses `focus:` rather than `focus-visible:`.
const FIELD_BASE =
  "w-full bg-surface-900 border border-surface-600 rounded-lg text-slate-200 placeholder-slate-500 " +
  "transition-[border-color,box-shadow] duration-150 ease-out " +
  "focus:outline-none focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/25 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

// ── Tab chrome ────────────────────────────────────────────────────────────────

export function TabToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex-shrink-0 flex flex-wrap items-center gap-2 sm:gap-4 px-4 sm:px-6 py-3",
        "border-b border-surface-700 bg-surface-800/40 backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex-1 overflow-y-auto p-4 sm:p-6", className)}>
      {children}
    </div>
  );
}

// ── Sidebar panel (Repository, Generator config, Log Analyzer input) ─────────

export function SidebarPanel({
  width = "lg:w-[420px]",
  children,
  className,
}: {
  /** Tailwind width classes — use `lg:` prefix (e.g. `lg:w-80`). Full width on mobile. */
  width?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "w-full min-w-0 flex-shrink-0 flex flex-col bg-surface-800/20",
        "border-b lg:border-b-0 lg:border-r border-surface-700",
        width,
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-4 sm:px-5 py-3",
        "border-b border-surface-700 bg-surface-800/40",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3", className)}>
      {children}
    </div>
  );
}

// ── Cards & sections ──────────────────────────────────────────────────────────

export function SurfaceCard({
  children,
  className,
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-surface-700 bg-surface-800/50",
        padding,
        className
      )}
    >
      {children}
    </div>
  );
}

/** Section heading used above cards on content pages — one weight/size
 * everywhere so page hierarchy stays predictable. */
export function SectionHeading({
  icon: Icon,
  iconClassName,
  title,
  meta,
  aside,
}: {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  meta?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 min-w-0">
      {Icon && <Icon className={clsx("w-4 h-4 flex-shrink-0", iconClassName ?? "text-slate-400")} aria-hidden />}
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {meta && <span className="text-xs text-slate-500 truncate">{meta}</span>}
      {aside && <div className="ml-auto flex-shrink-0">{aside}</div>}
    </div>
  );
}

export function SectionLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
      {children}
    </label>
  );
}

export function FormInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(FIELD_BASE, "px-3 py-2.5 sm:py-2 text-sm", className)}
      {...props}
    />
  );
}

export const FormTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={clsx(FIELD_BASE, "px-4 py-3 text-xs resize-none font-mono leading-relaxed", className)}
    {...props}
  />
));
FormTextarea.displayName = "FormTextarea";

export function SelectInput({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={clsx(FIELD_BASE, "appearance-none px-3 py-2.5 pr-9 text-sm cursor-pointer", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" aria-hidden />
    </div>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────────

/** The app's one primary call-to-action button — same shape/gradient family
 * everywhere (Generate STD, Generate Tests, etc.) instead of each screen
 * hand-rolling its own gradient classes. `accent` picks which of the app's
 * three CTA gradients to use; it's a visual grouping, not a new color. */
export function PrimaryButton({
  children,
  accent = "sky",
  size = "md",
  loading = false,
  icon: Icon,
  className,
  disabled,
  ...props
}: {
  children: ReactNode;
  accent?: "sky" | "emerald" | "violet";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: LucideIcon;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const accentMap = {
    sky: "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500",
    emerald: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500",
    violet: "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500",
  };
  const sizeMap = {
    sm: "h-8 px-3.5 text-xs",
    md: "h-10 px-5 text-sm",
  };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "pressable inline-flex items-center justify-center gap-2 text-white rounded-lg font-medium",
        "shadow-sm shadow-black/30 ring-1 ring-inset ring-white/10",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        FOCUS_RING,
        sizeMap[size],
        accentMap[accent],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" aria-hidden /> : Icon ? <Icon className="w-4 h-4 flex-shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx(
        "pressable inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium",
        "text-slate-300 hover:text-white bg-surface-700/80 hover:bg-surface-600",
        "border border-surface-600 rounded-lg",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        FOCUS_RING,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const ICON_TONES = {
  default: "text-slate-500 hover:text-slate-100",
  danger: "text-slate-500 hover:text-red-400 hover:bg-red-500/10",
  success: "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10",
  accent: "text-slate-500 hover:text-sky-400",
} as const;

/** Square icon-only button. `label` is required: it becomes both the
 * accessible name and the hover tooltip, so no icon button ships unlabeled. */
export function IconButton({
  icon: Icon,
  label,
  tone = "default",
  size = "md",
  loading = false,
  className,
  disabled,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  tone?: keyof typeof ICON_TONES;
  size?: "sm" | "md";
  loading?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      className={clsx(
        "pressable inline-flex items-center justify-center rounded-lg flex-shrink-0 hover:bg-surface-700",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        size === "sm" ? "w-7 h-7" : "w-8 h-8",
        ICON_TONES[tone],
        FOCUS_RING,
        className
      )}
      {...props}
    >
      {loading
        ? <Loader2 className={clsx(size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4", "animate-spin")} aria-hidden />
        : <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} aria-hidden />}
    </button>
  );
}

/** Copy-to-clipboard with an in-place icon morph (copy → check) instead of a
 * toast — copying is frequent, so the feedback lives where the eye already is. */
export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  showLabel = false,
  className,
}: {
  text: string;
  label?: string;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={clsx(
        "pressable inline-flex items-center justify-center gap-1.5 rounded-md flex-shrink-0",
        "text-slate-500 hover:text-slate-200 hover:bg-surface-700",
        showLabel ? "h-7 px-2 text-[11px] font-medium" : size === "sm" ? "w-7 h-7" : "w-8 h-8",
        FOCUS_RING,
        className
      )}
    >
      <span className={clsx("relative inline-flex", iconSize)} aria-hidden>
        <Copy
          className={clsx(
            "absolute inset-0 transition-[opacity,transform,filter] duration-200 ease-out",
            iconSize,
            copied ? "opacity-0 scale-50 blur-[2px]" : "opacity-100 scale-100 blur-0"
          )}
        />
        <Check
          className={clsx(
            "absolute inset-0 text-emerald-400 transition-[opacity,transform,filter] duration-200 ease-out",
            iconSize,
            copied ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-50 blur-[2px]"
          )}
        />
      </span>
      {showLabel && <span>{copied ? "Copied" : label}</span>}
      <span className="sr-only" aria-live="polite">{copied ? "Copied to clipboard" : ""}</span>
    </button>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** Classes applied when this segment is active (e.g. a colored fill). Defaults to a neutral raised surface. */
  activeClassName?: string;
  /** Optional trailing count badge. */
  count?: number;
}

/** Tab-style switcher (History views, Generator mode, etc.). Proper tablist
 * semantics + ←/→ keyboard navigation. Color changes only — no sliding
 * indicator, since these are toggled constantly. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  fullWidth = false,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  /** `true` stretches segments equally; `"mobile"` does so only below `sm`. */
  fullWidth?: boolean | "mobile";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        "flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-900/80 border border-surface-700 overflow-x-auto",
        fullWidth === true ? "w-full" : fullWidth === "mobile" ? "w-full sm:w-fit" : "w-fit",
        className
      )}
    >
      {options.map((opt, i) => {
        const active = opt.id === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              "pressable inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap min-w-0",
              size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs",
              fullWidth === true && "flex-1",
              fullWidth === "mobile" && "flex-1 sm:flex-initial",
              active
                ? opt.activeClassName ?? "bg-surface-700 text-white shadow-sm shadow-black/20"
                : "text-slate-400 hover:text-slate-200",
              FOCUS_RING
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />}
            <span className="truncate">{opt.label}</span>
            {opt.count != null && (
              <span
                className={clsx(
                  "tabular-nums text-[10px] px-1.5 rounded-full",
                  active ? "bg-white/10 text-slate-200" : "bg-surface-700 text-slate-500"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

/** Semantic badge palette — one source of truth for status/label colors. */
export const BADGE_TONES = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  danger: "bg-red-500/10 text-red-400 border-red-500/25",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  info: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  accent: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  teal: "bg-teal-500/10 text-teal-400 border-teal-500/25",
  pink: "bg-pink-500/10 text-pink-400 border-pink-500/25",
  orange: "bg-orange-500/10 text-orange-300 border-orange-500/25",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25",
  neutral: "bg-surface-700/60 text-slate-400 border-surface-600",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  icon: Icon,
  dot = false,
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  /** Leading status dot (static — no pulsing). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 flex-shrink-0 rounded-md border px-1.5 py-0.5",
        "text-[10px] font-semibold uppercase tracking-wide leading-none whitespace-nowrap",
        BADGE_TONES[tone],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {Icon && <Icon className="w-2.5 h-2.5" aria-hidden />}
      {children}
    </span>
  );
}

// ── Code ──────────────────────────────────────────────────────────────────────

/** Read-only monospace block with a header row and copy button — for raw
 * logs, stack traces and source previews. */
export function CodeBlock({
  code,
  label,
  maxHeight = "max-h-60",
  className,
  wrap = true,
}: {
  code: string;
  label?: string;
  maxHeight?: string;
  className?: string;
  wrap?: boolean;
}) {
  const lines = code.split("\n").length;
  return (
    <div className={clsx("rounded-lg border border-surface-700 bg-surface-900 overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 pl-3 pr-1 h-8 border-b border-surface-700 bg-surface-800/60">
        <span className="text-[11px] font-medium text-slate-500 truncate">
          {label}
          <span className="ml-2 text-slate-600 tabular-nums">{lines} line{lines !== 1 ? "s" : ""}</span>
        </span>
        <CopyButton text={code} label={`Copy ${label?.toLowerCase() ?? "code"}`} />
      </div>
      <pre
        className={clsx(
          "px-3 py-2.5 text-[11px] leading-5 font-mono text-slate-400 overflow-auto",
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
          maxHeight
        )}
      >
        {code}
      </pre>
    </div>
  );
}

// ── Feedback states ───────────────────────────────────────────────────────────

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={clsx("skeleton", className)} style={style} aria-hidden />;
}

/** Placeholder that mirrors the list-card layout used in History/Repository,
 * so content lands in place instead of replacing a centered spinner. */
export function SkeletonCardList({ count = 3, label = "Loading…" }: { count?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-surface-700 bg-surface-800/40 p-4 sm:p-5 flex items-start gap-3"
          style={{ opacity: 1 - i * 0.2 }}
        >
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-40 max-w-[50%]" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg flex-shrink-0 hidden sm:block" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3" role="status">
      <Loader2 className="w-5 h-5 animate-spin text-sky-400/70" aria-hidden />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  accent = "sky",
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  hint?: string;
  accent?: "sky" | "violet" | "emerald" | "amber" | "slate";
  action?: ReactNode;
  compact?: boolean;
}) {
  const accentMap = {
    sky: "bg-sky-500/10 border-sky-500/20 text-sky-400",
    violet: "bg-violet-500/10 border-violet-500/20 text-violet-400",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    slate: "bg-surface-700/50 border-surface-600 text-slate-400",
  };

  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center text-center animate-fade-in",
        compact ? "py-8 min-h-0 px-6 gap-3" : "flex-1 py-16 gap-4 min-h-[280px] px-8"
      )}
    >
      <div
        className={clsx(
          "rounded-2xl border flex items-center justify-center",
          compact ? "w-12 h-12" : "w-14 h-14",
          accentMap[accent]
        )}
      >
        <Icon className={clsx(compact ? "w-5 h-5" : "w-6 h-6")} aria-hidden />
      </div>
      <div className={clsx("max-w-sm", compact ? "space-y-1" : "space-y-1.5")}>
        <p className={clsx("font-semibold text-slate-100", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && (
          <p className={clsx("text-slate-400 leading-relaxed", compact ? "text-xs" : "text-sm")}>{description}</p>
        )}
        {hint && !compact && <p className="text-xs text-slate-500 pt-1">{hint}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300/90">
      {children}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 animate-fade-in">
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  subValue,
  icon: Icon,
  accent,
  isNa,
}: {
  label: string;
  value: string;
  hint: string;
  subValue?: string;
  icon: LucideIcon;
  accent: string;
  isNa?: boolean;
}) {
  return (
    <SurfaceCard padding="p-4 sm:p-5" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br flex-shrink-0", accent)}>
          <Icon className="w-4 h-4 text-white" aria-hidden />
        </div>
      </div>
      <div>
        <p className={clsx("text-2xl font-semibold tracking-tight tabular-nums", isNa ? "text-slate-500" : "text-white")}>
          {value}
        </p>
        {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{hint}</p>
      </div>
    </SurfaceCard>
  );
}

export function MetricCardSkeleton() {
  return (
    <SurfaceCard padding="p-4 sm:p-5" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </SurfaceCard>
  );
}
