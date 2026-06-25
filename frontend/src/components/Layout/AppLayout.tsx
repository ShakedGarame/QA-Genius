import { useEffect, useState } from "react";
import {
  BrainCircuit,
  Sparkles,
  FolderOpen,
  Activity,
  History,
  LayoutDashboard,
  Settings,
  Menu,
  X,
  Github,
  LogOut,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import TestGeneratorTab from "../../pages/tabs/TestGeneratorTab";
import TestRepositoryTab from "../../pages/tabs/TestRepositoryTab";
import LogAnalyzerTab from "../../pages/tabs/LogAnalyzerTab";
import HistoryTab from "../../pages/tabs/HistoryTab";
import DashboardTab from "../../pages/tabs/DashboardTab";
import SettingsTab from "../../pages/tabs/SettingsTab";
import type { AuthUser } from "../../hooks/useAuth";

export type TabId = "generator" | "repository" | "analyzer" | "history" | "dashboard" | "settings";

const NAV_ITEMS: {
  id: TabId;
  label: string;
  description: string;
  icon: typeof Sparkles;
  accent: string;
  bottom?: boolean;
}[] = [
  { id: "generator", label: "Test Generator", description: "Create tests from PRD or Swagger", icon: Sparkles, accent: "from-sky-500 to-indigo-500" },
  { id: "repository", label: "Test Repository", description: "Run and manage saved tests", icon: FolderOpen, accent: "from-emerald-500 to-teal-500" },
  { id: "analyzer", label: "Log Analyzer", description: "AI root-cause from logs", icon: Activity, accent: "from-violet-500 to-purple-500" },
  { id: "history", label: "History", description: "Past tests and log analyses", icon: History, accent: "from-amber-500 to-orange-500" },
  { id: "dashboard", label: "Dashboard", description: "Pass rate, speed, and run totals", icon: LayoutDashboard, accent: "from-cyan-500 to-blue-600" },
  { id: "settings", label: "Settings", description: "API keys, integrations, paths", icon: Settings, accent: "from-slate-500 to-slate-600", bottom: true },
];

const MAIN_NAV = NAV_ITEMS.filter((i) => !i.bottom);
const BOTTOM_NAV = NAV_ITEMS.filter((i) => i.bottom);

// ─── NavButton ────────────────────────────────────────────────────────────────

function NavButton({
  item,
  isActive,
  onClick,
  compact = false,
}: {
  item: (typeof NAV_ITEMS)[number];
  isActive: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={clsx(
        "w-full flex items-center gap-3 rounded-xl text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900",
        compact ? "px-3 py-2.5" : "px-3 py-3",
        isActive
          ? "bg-surface-700/90 text-white shadow-sm border border-surface-500/60"
          : "text-slate-400 hover:text-slate-100 hover:bg-surface-800/80 border border-transparent"
      )}
    >
      <div className={clsx(
        "flex-shrink-0 rounded-lg flex items-center justify-center transition-all",
        compact ? "w-8 h-8" : "w-9 h-9",
        isActive ? `bg-gradient-to-br ${item.accent} shadow-md` : "bg-surface-700"
      )}>
        <Icon className="w-4 h-4 text-white" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx("font-medium leading-tight", compact ? "text-xs" : "text-sm")}>{item.label}</p>
        {!compact && (
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5 truncate">{item.description}</p>
        )}
      </div>
      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" aria-hidden />}
    </button>
  );
}

// ─── UserDropdown — placed in the top-right header ───────────────────────────

function UserDropdown({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const avatar = user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.name}
      className="w-8 h-8 rounded-full flex-shrink-0 ring-2 ring-surface-600"
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
      {initials}
    </div>
  );

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="User menu"
        className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-surface-700 border border-transparent hover:border-surface-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        {avatar}
        <div className="hidden sm:block min-w-0 text-left">
          <p className="text-sm font-medium text-slate-200 truncate max-w-[140px]">{user.name}</p>
          {user.email && (
            <p className="text-[11px] text-slate-500 truncate max-w-[140px]">{user.email}</p>
          )}
        </div>
        <ChevronDown
          className={clsx("w-3.5 h-3.5 text-slate-500 flex-shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />

          {/* Dropdown — opens DOWNWARD from the header */}
          <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-surface-700 border border-surface-500 rounded-xl shadow-2xl overflow-hidden">
            {/* User info header */}
            <div className="px-4 py-3 border-b border-surface-600">
              <div className="flex items-center gap-2.5">
                {avatar}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                  {user.email && (
                    <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => { setOpen(false); onLogout(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export default function AppLayout({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>("generator");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeItem = NAV_ITEMS.find((t) => t.id === activeTab) ?? NAV_ITEMS[0];

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const tab = (event as CustomEvent<{ tab: TabId }>).detail?.tab;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("qa-genius:navigate-tab", onNavigate);
    return () => window.removeEventListener("qa-genius:navigate-tab", onNavigate);
  }, []);

  const selectTab = (id: TabId) => {
    setActiveTab(id);
    setMobileNavOpen(false);
  };

  return (
    <div className="flex h-screen bg-surface-900 overflow-hidden">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-sky-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden lg:flex w-72 flex-shrink-0 flex-col border-r border-surface-600 bg-surface-800/40"
        aria-label="Application navigation"
      >
        {/* Logo */}
        <div className="px-5 py-6 border-b border-surface-600">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-900/30" aria-hidden>
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">QA-Genius</h1>
              <p className="text-xs text-slate-400 mt-0.5">AI Test Automation Hub</p>
            </div>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <p className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Workspace
          </p>
          {MAIN_NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              onClick={() => selectTab(item.id)}
            />
          ))}
        </nav>

        {/* Bottom nav — Settings + GitHub (no user widget here) */}
        <div className="px-3 py-4 border-t border-surface-600 space-y-1.5">
          {BOTTOM_NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              onClick={() => selectTab(item.id)}
            />
          ))}
          <a
            href="https://github.com/shakedgarame"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors rounded-lg px-3 py-2 mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <Github className="w-4 h-4" aria-hidden />
            <span>Source on GitHub</span>
          </a>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile / tablet header */}
        <header className="lg:hidden flex-shrink-0 border-b border-surface-600 bg-surface-800/80 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center flex-shrink-0" aria-hidden>
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">QA-Genius</p>
                <p className="text-[10px] text-slate-500 truncate">{activeItem.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <UserDropdown user={user} onLogout={onLogout} />
              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-nav"
                aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileNavOpen && (
            <nav id="mobile-nav" className="px-3 pb-3 space-y-1 border-t border-surface-600/80 pt-3" aria-label="Mobile navigation">
              {[...MAIN_NAV, ...BOTTOM_NAV].map((item) => (
                <NavButton key={item.id} item={item} isActive={activeTab === item.id} onClick={() => selectTab(item.id)} compact />
              ))}
            </nav>
          )}

          {!mobileNavOpen && (
            <nav className="flex gap-1 px-3 pb-3 overflow-x-auto scrollbar-thin" aria-label="Section tabs">
              {[...MAIN_NAV, ...BOTTOM_NAV].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                      isActive ? "bg-surface-700 text-white border border-surface-500/50" : "text-slate-500 hover:text-slate-200 hover:bg-surface-800"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}
        </header>

        {/* Desktop page title bar — UserDropdown lives here */}
        <header className="hidden lg:flex flex-shrink-0 items-center justify-between px-6 py-3 border-b border-surface-600 bg-surface-900/50">
          <div>
            <h2 className="text-lg font-semibold text-white">{activeItem.label}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{activeItem.description}</p>
          </div>

          {/* User dropdown — top right */}
          <UserDropdown user={user} onLogout={onLogout} />
        </header>

        {/* Tab panels — kept mounted to preserve in-progress work */}
        <main id="main-content" className="flex-1 min-h-0 flex flex-col" tabIndex={-1}>
          <div className={activeTab === "generator" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <TestGeneratorTab />
          </div>
          <div className={activeTab === "repository" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <TestRepositoryTab />
          </div>
          <div className={activeTab === "analyzer" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <LogAnalyzerTab />
          </div>
          <div className={activeTab === "history" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <HistoryTab />
          </div>
          <div className={activeTab === "dashboard" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <DashboardTab />
          </div>
          <div className={activeTab === "settings" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <SettingsTab />
          </div>
        </main>
      </div>
    </div>
  );
}
