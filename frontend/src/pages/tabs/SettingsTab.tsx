import { useState, useEffect, useCallback } from "react";
import {
  BrainCircuit,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Wifi,
  WifiOff,
  Github,
} from "lucide-react";
import clsx from "clsx";
import { getStoredOpenAIKey, setStoredOpenAIKey, syncOpenAIKeyToStorage, isRealOpenAIKey } from "../../lib/apiKeys";
import {
  getStoredGitHubToken,
  setStoredGitHubToken,
  syncGitHubTokenToStorage,
  isRealGitHubToken,
} from "../../lib/githubToken";
import { TabContent, LoadingState } from "../../components/ui/layout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsData {
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  coralogix_api_key: string | null;
  coralogix_team_name: string | null;
  coralogix_region: string | null;
  tests_output_dir: string | null;
  env_has_openai: boolean;
  env_has_anthropic: boolean;
  env_has_coralogix: boolean;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
      {activeLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden />
      {inactiveLabel}
    </span>
  );
}

// ─── Secret input field ───────────────────────────────────────────────────────

function SecretInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  const isMasked = value.includes("•");

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show && !isMasked ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Enter key…"}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-surface-900 border border-surface-500 focus:border-sky-500 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors font-mono"
        />
        {!isMasked && value && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide key" : "Show key"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: typeof BrainCircuit;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-800/50 border border-surface-600 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-600 bg-surface-800/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center">
            <Icon className="w-4 h-4 text-slate-300" aria-hidden />
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {badge}
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsTab() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local form state — initialize from localStorage so refresh keeps the key visible.
  const [openaiKey, setOpenaiKey] = useState(() => getStoredOpenAIKey() ?? "");
  const [githubToken, setGithubToken] = useState(() => getStoredGitHubToken() ?? "");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [coralogixKey, setCoralogixKey] = useState("");
  const [coralogixTeam, setCoralogixTeam] = useState("");
  const [coralogixRegion, setCoralogixRegion] = useState("EU");
  const [testsDir, setTestsDir] = useState("");

  // Coralogix connection test
  const [testingCoralogix, setTestingCoralogix] = useState(false);
  const [coralogixStatus, setCoralogixStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [serverHasOpenAI, setServerHasOpenAI] = useState(false);

  const handleOpenAIKeyChange = (value: string) => {
    setOpenaiKey(value);
    syncOpenAIKeyToStorage(value);
  };

  const handleGitHubTokenChange = (value: string) => {
    setGithubToken(value);
    syncGitHubTokenToStorage(value);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      const settings: SettingsData = await res.json();
      setData(settings);
      setServerHasOpenAI(!!settings.openai_api_key);

      const storedOpenAI = getStoredOpenAIKey();
      if (storedOpenAI) {
        setOpenaiKey(storedOpenAI);
      } else if (settings.openai_api_key?.includes("•")) {
        setOpenaiKey("");
      } else if (settings.openai_api_key) {
        setOpenaiKey(settings.openai_api_key);
        syncOpenAIKeyToStorage(settings.openai_api_key);
      }

      const storedGitHub = getStoredGitHubToken();
      if (storedGitHub) setGithubToken(storedGitHub);
      setAnthropicKey(settings.anthropic_api_key ?? "");
      setCoralogixKey(settings.coralogix_api_key ?? "");
      setCoralogixTeam(settings.coralogix_team_name ?? "");
      setCoralogixRegion(settings.coralogix_region ?? "EU");
      setTestsDir(settings.tests_output_dir ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, string> = {};
      // Only send keys that have changed (don't overwrite with masked placeholder)
      if (isRealOpenAIKey(openaiKey)) {
        body.openai_api_key = openaiKey.trim();
        setStoredOpenAIKey(openaiKey.trim());
      } else if (!openaiKey.trim()) {
        body.openai_api_key = "";
        setStoredOpenAIKey(null);
      }
      if (!anthropicKey.includes("•")) body.anthropic_api_key = anthropicKey;
      if (!coralogixKey.includes("•")) body.coralogix_api_key = coralogixKey;
      body.coralogix_team_name = coralogixTeam;
      body.coralogix_region = coralogixRegion;
      body.tests_output_dir = testsDir;

      const res = await fetch("/api/me/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Keep the full key visible from localStorage — do not replace with masked server value.
      const storedAfterSave = getStoredOpenAIKey();
      if (storedAfterSave) setOpenaiKey(storedAfterSave);
      const storedGitHubAfterSave = getStoredGitHubToken();
      if (storedGitHubAfterSave) setGithubToken(storedGitHubAfterSave);
      if (!storedAfterSave && !storedGitHubAfterSave) await loadSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const testCoralogixConnection = async () => {
    const key = coralogixKey.includes("•") ? data?.coralogix_api_key : coralogixKey;
    if (!key) return;
    setTestingCoralogix(true);
    setCoralogixStatus("idle");
    try {
      const res = await fetch("/api/me/settings/test-coralogix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ coralogix_region: coralogixRegion }),
      });
      setCoralogixStatus(res.ok ? "ok" : "fail");
    } catch {
      setCoralogixStatus("fail");
    } finally {
      setTestingCoralogix(false);
    }
  };

  // Derived state
  const storedOpenAI = getStoredOpenAIKey();
  const hasRealOpenAIKey = isRealOpenAIKey(storedOpenAI) || isRealOpenAIKey(openaiKey);
  const hasRealGitHubToken = isRealGitHubToken(getStoredGitHubToken()) || isRealGitHubToken(githubToken);
  const aiActive = !!(data?.env_has_openai || data?.env_has_anthropic || hasRealOpenAIKey);
  const hasUserOpenAI = hasRealOpenAIKey;
  const coralogixActive = !!(data?.env_has_coralogix || coralogixKey);

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0">
        <LoadingState message="Loading settings…" />
      </div>
    );
  }

  return (
    <TabContent>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Error */}
        {error && (
          <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── 1. AI Configuration ────────────────────────────────────────────── */}
        <Section
          icon={BrainCircuit}
          title="AI Configuration"
          badge={
            <StatusBadge
              active={aiActive}
              activeLabel="Live AI Active"
              inactiveLabel="Mock Mode (Free Demo)"
            />
          }
        >
          {data?.env_has_openai && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-300">
                Backend <code className="font-mono">OPENAI_API_KEY</code> is configured — all users get real AI generation automatically.
              </p>
            </div>
          )}

          <SecretInput
            id="openai-key"
            label="OpenAI API Key"
            value={openaiKey}
            onChange={handleOpenAIKeyChange}
            placeholder="sk-…"
            hint={
              data?.env_has_openai
                ? "Optional: your key takes priority over the backend environment key."
                : "Required for real AI generation. Saved automatically in this browser as you type."
            }
          />

          {serverHasOpenAI && !hasRealOpenAIKey && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              A key is saved on your account — paste it here once to activate this browser.
            </p>
          )}

          {hasUserOpenAI && (
            <p className="text-[11px] text-sky-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Your key will be used for all generation and analysis requests.
            </p>
          )}

          <SecretInput
            id="anthropic-key"
            label="Anthropic API Key (optional)"
            value={anthropicKey}
            onChange={setAnthropicKey}
            placeholder="sk-ant-…"
            hint="Fallback AI provider used when no OpenAI key is available."
          />
        </Section>

        {/* ── Cloud Test Runner (GitHub Actions) ─────────────────────────────── */}
        <Section
          icon={Github}
          title="Cloud Test Runner"
          badge={
            <StatusBadge
              active={hasRealGitHubToken}
              activeLabel="GitHub Actions Ready"
              inactiveLabel="Local / Demo Only"
            />
          }
        >
          <SecretInput
            id="github-token"
            label="GitHub Personal Access Token"
            value={githubToken}
            onChange={handleGitHubTokenChange}
            placeholder="ghp_… or github_pat_…"
            hint="Required on Vercel to trigger real Playwright runs via GitHub Actions. Needs repo scope. Saved automatically in this browser."
          />
          {hasRealGitHubToken && (
            <p className="text-[11px] text-sky-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Run Test will dispatch workflow <code className="font-mono">trigger-playwright-test</code> on ShakedGarame/QA-Genius.
            </p>
          )}
        </Section>

        {/* ── 2. Observability / Coralogix ──────────────────────────────────── */}
        <Section
          icon={Wifi}
          title="Observability Integration"
          badge={
            <StatusBadge
              active={coralogixActive}
              activeLabel="Connected"
              inactiveLabel="Simulated (Mock)"
            />
          }
        >
          {data?.env_has_coralogix && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-300">
                Backend <code className="font-mono">CORALOGIX_API_KEY</code> is set — the Log Analyzer will fetch live data.
              </p>
            </div>
          )}

          <SecretInput
            id="coralogix-key"
            label="Coralogix API Key"
            value={coralogixKey}
            onChange={(v) => { setCoralogixKey(v); setCoralogixStatus("idle"); }}
            placeholder="cxtp_…"
            hint="Your Coralogix Logs Query API key. Enables live log fetching in the Log Analyzer."
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="coralogix-team" className="block text-sm font-medium text-slate-300 mb-1.5">
                Team Name
              </label>
              <input
                id="coralogix-team"
                type="text"
                value={coralogixTeam}
                onChange={(e) => setCoralogixTeam(e.target.value)}
                placeholder="my-team"
                className="w-full bg-surface-900 border border-surface-500 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
              />
            </div>
            <div>
              <label htmlFor="coralogix-region" className="block text-sm font-medium text-slate-300 mb-1.5">
                Region
              </label>
              <select
                id="coralogix-region"
                value={coralogixRegion}
                onChange={(e) => setCoralogixRegion(e.target.value)}
                className="w-full bg-surface-900 border border-surface-500 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors"
              >
                <option value="EU">EU (Europe)</option>
                <option value="US">US (United States)</option>
                <option value="AP">AP (Asia-Pacific)</option>
              </select>
            </div>
          </div>

          {/* Test connection button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={testCoralogixConnection}
              disabled={!coralogixKey || testingCoralogix}
              className="flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-surface-500 rounded-lg text-xs font-medium text-slate-300 transition-all disabled:opacity-40"
            >
              {testingCoralogix ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wifi className="w-3.5 h-3.5" />
              )}
              Test Connection
            </button>
            {coralogixStatus === "ok" && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected successfully
              </span>
            )}
            {coralogixStatus === "fail" && (
              <span className="flex items-center gap-1.5 text-xs text-red-400">
                <WifiOff className="w-3.5 h-3.5" /> Connection failed — check your key and region
              </span>
            )}
          </div>
        </Section>

        {/* ── 3. Local / Git Target ──────────────────────────────────────────── */}
        <Section icon={FolderOpen} title="Local / Git Target">
          <div>
            <label htmlFor="tests-dir" className="block text-sm font-medium text-slate-300 mb-1.5">
              Tests Output Directory
            </label>
            <input
              id="tests-dir"
              type="text"
              value={testsDir}
              onChange={(e) => setTestsDir(e.target.value)}
              placeholder="/Users/you/my-project/tests/e2e"
              className="w-full bg-surface-900 border border-surface-500 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors font-mono"
            />
            <p className="text-[11px] text-slate-600 mt-1">
              Absolute path where generated Playwright test folders are written.
              Defaults to <code className="font-mono">tests/generated/</code> inside the QA-Genius project root.
            </p>
          </div>
        </Section>

        {/* ── Save button ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pb-4">
          <p className="text-xs text-slate-600">
            Settings are saved per-account and never shared between users.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
              saved
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-900/30",
              saving && "opacity-60"
            )}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>
    </TabContent>
  );
}
