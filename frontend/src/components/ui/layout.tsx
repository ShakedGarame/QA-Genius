import React from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";

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
        "flex-shrink-0 flex items-center gap-4 px-6 py-3",
        "border-b border-surface-600 bg-surface-800/40 backdrop-blur-sm",
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
    <div className={clsx("flex-1 overflow-y-auto p-6", className)}>
      {children}
    </div>
  );
}

// ── Sidebar panel (Repository, Generator config, Log Analyzer input) ─────────

export function SidebarPanel({
  width = "w-[420px]",
  children,
  className,
}: {
  width?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        width,
        "flex-shrink-0 border-r border-surface-600 flex flex-col bg-surface-800/20",
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
        "flex items-center justify-between gap-3 px-5 py-3",
        "border-b border-surface-600 bg-surface-800/40",
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
    <div className={clsx("flex-1 overflow-y-auto p-4 space-y-3", className)}>
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
        "rounded-xl border border-surface-600 bg-surface-800/50",
        padding,
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
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
      className={clsx(
        "w-full bg-surface-900 border border-surface-600 rounded-lg",
        "px-3 py-2 text-sm text-slate-200 placeholder-slate-500",
        "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-colors",
        className
      )}
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
    className={clsx(
      "w-full bg-surface-900 border border-surface-600 rounded-lg",
      "px-4 py-3 text-xs text-slate-200 placeholder-slate-500",
      "focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500",
      "resize-none font-mono leading-relaxed transition-colors",
      className
    )}
    {...props}
  />
));
FormTextarea.displayName = "FormTextarea";

export function SecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium",
        "text-slate-300 hover:text-white bg-surface-700 hover:bg-surface-600",
        "border border-transparent hover:border-surface-500/50 rounded-lg transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Feedback states ───────────────────────────────────────────────────────────

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-sky-400/70" />
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
    sky: "bg-sky-500/10 border-sky-500/25 text-sky-400",
    violet: "bg-violet-500/10 border-violet-500/25 text-violet-400",
    emerald: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    amber: "bg-amber-500/10 border-amber-500/25 text-amber-400",
    slate: "bg-surface-700/50 border-surface-600 text-slate-400",
  };

  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center text-center px-6 gap-3",
        compact ? "py-8 min-h-0" : "flex-1 py-16 gap-4 min-h-[280px] px-8"
      )}
    >
      <div
        className={clsx(
          "rounded-2xl border flex items-center justify-center shadow-inner",
          compact ? "w-12 h-12" : "w-16 h-16",
          accentMap[accent]
        )}
      >
        <Icon className={clsx(compact ? "w-5 h-5" : "w-7 h-7", "opacity-80")} aria-hidden />
      </div>
      <div className={clsx("max-w-sm space-y-1", compact ? "space-y-0.5" : "space-y-1.5")}>
        <p className={clsx("font-medium text-slate-200", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && (
          <p className={clsx("text-slate-500 leading-relaxed", compact ? "text-xs" : "text-sm")}>{description}</p>
        )}
        {hint && !compact && <p className="text-xs text-slate-600 pt-1">{hint}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400">
      {children}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
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
    <SurfaceCard padding="p-5" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-sm", accent)}>
          <Icon className="w-4 h-4 text-white" aria-hidden />
        </div>
      </div>
      <div>
        <p className={clsx("text-2xl font-bold tracking-tight", isNa ? "text-slate-500" : "text-white")}>
          {value}
        </p>
        {subValue && <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>}
        <p className="text-xs text-slate-500 mt-1.5">{hint}</p>
      </div>
    </SurfaceCard>
  );
}
