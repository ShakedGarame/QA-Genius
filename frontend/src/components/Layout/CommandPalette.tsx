import { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import clsx from "clsx";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Extra terms matched against the query but never shown. */
  keywords?: string[];
  section: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}

function matches(item: CommandItem, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [item.label, item.description ?? "", ...(item.keywords ?? [])].join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** Global ⌘K / Ctrl+K launcher — jump to any tab or run a quick action without
 * touching the mouse. Mounted once inside AppLayout so items can call
 * setActiveTab/onLogout directly instead of round-tripping through a
 * window event. */
export default function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => items.filter((item) => matches(item, query)), [items, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus after the modal's mount paints, so autofocus doesn't fight open animation.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) {
          onClose();
          item.run();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, filtered, activeIndex]);

  if (!open) return null;

  // Group filtered items by section, preserving first-seen section order.
  const sections: { section: string; items: CommandItem[] }[] = [];
  for (const item of filtered) {
    const group = sections.find((s) => s.section === item.section);
    if (group) group.items.push(item);
    else sections.push({ section: item.section, items: [item] });
  }

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-600">
          <Search className="w-4 h-4 text-slate-500 flex-shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a tab or run a command…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            aria-label="Search commands"
          />
          <kbd className="hidden sm:inline text-[10px] font-mono text-slate-500 bg-surface-700 border border-surface-600 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No matching commands.</p>
          )}
          {sections.map((group) => (
            <div key={group.section} className="mb-1 last:mb-0">
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                {group.section}
              </p>
              {group.items.map((item) => {
                runningIndex += 1;
                const index = runningIndex;
                const Icon = item.icon;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onClose();
                      item.run();
                    }}
                    className={clsx(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      isActive ? "bg-sky-500/15 text-white" : "text-slate-300 hover:bg-surface-700/60"
                    )}
                  >
                    <Icon className={clsx("w-4 h-4 flex-shrink-0", isActive ? "text-sky-400" : "text-slate-500")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      {item.description && (
                        <p className="text-[11px] text-slate-500 truncate">{item.description}</p>
                      )}
                    </div>
                    {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-surface-600 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> Navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" /> Select
          </span>
        </div>
      </div>
    </div>
  );
}
