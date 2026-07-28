import { useEffect, useRef, useState, lazy, Suspense } from "react";
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
import type { AuthUser } from "../../hooks/useAuth";

// Lazy-loaded so each tab's code (and, for Test Generator, Monaco) only
// downloads once the user actually visits that tab, instead of all six
// tabs' bundles + data fetches firing together on first load/login.
const TestGeneratorTab = lazy(() => import("../../pages/tabs/TestGeneratorTab"));
const TestRepositoryTab = lazy(() => import("../../pages/tabs/TestRepositoryTab"));
const LogAnalyzerTab = lazy(() => import("../../pages/tabs/LogAnalyzerTab"));
const HistoryTab = lazy(() => import("../../pages/tabs/HistoryTab"));
const DashboardTab = lazy(() => import("../../pages/tabs/DashboardTab"));
const SettingsTab = lazy(() => import("../../pages/tabs/SettingsTab"));

function TabLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center py-16">
      <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

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
        compact ? "px-3 py-2" : "px-3 py-3",
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
        <p className={clsx("font-medium leading-tight", compact ? "text-sm" : "text-sm")}>{item.label}</p>
        {!compact && (
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5 truncate">{item.description}</p>
        )}
      </div>
      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" aria-hidden />}
    </button>
  );
}

// ─── UserDropdown ─────────────────────────────────────────────────────────────

function UserDropdown({ user, onLogout, mobile = false }: { user: AuthUser; onLogout: () => void; mobile?: boolean }) {
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
        className={clsx(
          "flex items-center rounded-xl hover:bg-surface-700 border border-transparent hover:border-surface-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
          mobile ? "p-1" : "gap-2.5 px-3 py-2"
        )}
      >
        {avatar}
        {!mobile && (
          <>
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
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-surface-700 border border-surface-500 rounded-xl shadow-2xl overflow-hidden">
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

// ─── Mobile drawer ────────────────────────────────────────────────────────────

function MobileNavDrawer({
  open,
  onClose,
  activeTab,
  onSelectTab,
}: {
  open: boolean;
  onClose: () => void;
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        id="mobile-nav"
        className="fixed inset-y-0 right-0 z-50 w-[min(100vw-3rem,20rem)] flex flex-col bg-surface-800 border-l border-surface-600 shadow-2xl lg:hidden animate-fade-in"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600">
          <p className="text-sm font-semibold text-white">Menu</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {[...MAIN_NAV, ...BOTTOM_NAV].map((item) => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              onClick={() => onSelectTab(item.id)}
              compact
            />
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-surface-600">
          <a
            href="https://github.com/ShakedGarame/QA-Genius"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors rounded-lg px-3 py-2"
          >
            <Github className="w-4 h-4" aria-hidden />
            Source on GitHub
          </a>
        </div>
      </aside>
    </>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export default function AppLayout({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>("generator");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Once a tab has been visited it stays mounted (just hidden) so switching
  // back preserves its state/scroll position — but it's never mounted, and
  // its data fetches never fire, until the user actually opens it.
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(["generator"]));
  const mainScrollRef = useRef<HTMLElement>(null);

  const activeItem = NAV_ITEMS.find((t) => t.id === activeTab) ?? NAV_ITEMS[0];
  const ActiveIcon = activeItem.icon;

  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
    // The right-side workspace is the sole scroll container — reset it to the
    // top on every tab switch so a new tab never opens mid-scroll.
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);

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
    <div className="flex h-[100dvh] bg-surface-900 overflow-hidden">
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
            href="https://github.com/ShakedGarame/QA-Genius"
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
        {/* Mobile header — single row, no duplicate tab bar */}
        <header className="lg:hidden flex-shrink-0 border-b border-surface-600 bg-surface-800/90 backdrop-blur-sm safe-top">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center flex-shrink-0" aria-hidden>
                <BrainCircuit className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate leading-tight">QA-Genius</p>
                <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                  <ActiveIcon className="w-3 h-3 flex-shrink-0" aria-hidden />
                  {activeItem.label}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <UserDropdown user={user} onLogout={onLogout} mobile />
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-nav"
                aria-label="Open menu"
                className="p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-surface-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <MobileNavDrawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          activeTab={activeTab}
          onSelectTab={selectTab}
        />

        {/* Desktop page title bar */}
        <header className="hidden lg:flex flex-shrink-0 items-center justify-between px-6 py-3 border-b border-surface-600 bg-surface-800/40 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-semibold text-white">{activeItem.label}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{activeItem.description}</p>
          </div>
          <UserDropdown user={user} onLogout={onLogout} />
        </header>

        <main
          id="main-content"
          ref={mainScrollRef}
          className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto pb-24 scroll-smooth"
          tabIndex={-1}
        >
          {visitedTabs.has("generator") && (
            <div className={activeTab === "generator" ? "flex flex-col lg:flex-1 lg:min-h-0" : "hidden"}>
              <Suspense fallback={<TabLoadingFallback />}>
                <TestGeneratorTab />
              </Suspense>
            </div>
          )}
          {visitedTabs.has("repository") && (
            <div className={activeTab === "repository" ? "flex flex-col lg:flex-1 lg:min-h-0" : "hidden"}>
              <Suspense fallback={<TabLoadingFallback />}>
                <TestRepositoryTab />
              </Suspense>
            </div>
          )}
          {visitedTabs.has("analyzer") && (
            <div className={activeTab === "analyzer" ? "flex flex-col lg:flex-1 lg:min-h-0" : "hidden"}>
              <Suspense fallback={<TabLoadingFallback />}>
                <LogAnalyzerTab />
              </Suspense>
            </div>
          )}
          {visitedTabs.has("history") && (
            <div className={activeTab === "history" ? "flex flex-col lg:flex-1 lg:min-h-0" : "hidden"}>
              <Suspense fallback={<TabLoadingFallback />}>
                <HistoryTab />
              </Suspense>
            </div>
          )}
          {visitedTabs.has("dashboard") && (
            <div className={activeTab === "dashboard" ? "flex flex-col lg:flex-1 lg:min-h-0" : "hidden"}>
              <Suspense fallback={<TabLoadingFallback />}>
                <DashboardTab />
              </Suspense>
            </div>
          )}
          {visitedTabs.has("settings") && (
            <div className={activeTab === "settings" ? "flex flex-col lg:flex-1 lg:min-h-0" : "hidden"}>
              <Suspense fallback={<TabLoadingFallback />}>
                <SettingsTab />
              </Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
