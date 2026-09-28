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
  TicketCheck,
  Lock,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

// The repository this QA-Genius instance is wired to — used as the default
// value for the GitHub Issues repo field so users don't have to type it.
const PLATFORM_GITHUB_REPO = "ShakedGarame/QA-Genius";

// Tolerates a pasted GitHub URL and reduces it to "owner/repo" — the API
// needs the bare path, not the browser address-bar URL.
function normalizeGithubRepo(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/]+)/i);
  const repo = match ? match[1] : trimmed;
  return repo.replace(/\.git$/i, "");
}
import clsx from "clsx";
import { getStoredOpenAIKey, setStoredOpenAIKey, syncOpenAIKeyToStorage, isRealOpenAIKey } from "../../lib/apiKeys";
import {
  getStoredGitHubToken,
  setStoredGitHubToken,
  syncGitHubTokenToStorage,
  isRealGitHubToken,
} from "../../lib/githubToken";
import { toast } from "sonner";
import {
  TabContent,
  Skeleton,
  Badge,
  FormInput,
  SelectInput,
  SecondaryButton,
  ErrorBanner,
  FOCUS_RING,
} from "../../components/ui/layout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsData {
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  coralogix_api_key: string | null;
  coralogix_team_name: string | null;
  coralogix_region: string | null;
  tests_output_dir: string | null;
  github_issues_repo: string | null;
  jira_domain: string | null;
  jira_email: string | null;
  jira_api_token: string | null;
  env_has_openai: boolean;
  env_has_anthropic: boolean;
  env_has_coralogix: boolean;
  env_has_github_pat: boolean;
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
  // Static dot — a status that never changes on screen shouldn't pulse forever.
  return (
    <Badge tone={active ? "success" : "warning"} dot className="normal-case tracking-normal text-[11px] px-2 py-1">
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}

// ─── Field chrome ─────────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200 mb-1.5">
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{children}</p>;
}

// ─── Secret input field ───────────────────────────────────────────────────────

function SecretInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isMasked = value.includes("•");

  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <FormInput
          id={id}
          name={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Enter key…"}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          className={clsx("pr-10 font-mono", !(show && !isMasked) && "secret-mask")}
        />
        {!disabled && !isMasked && value && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide key" : "Show key"}
            className={clsx("pressable absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-surface-700", FOCUS_RING)}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <FieldHint>{hint}</FieldHint>}
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
    <section className="bg-surface-800/50 border border-surface-700 rounded-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-surface-700">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface-700/70 border border-surface-600 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-slate-300" aria-hidden />
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {badge && <div className="flex-shrink-0">{badge}</div>}
      </div>
      <div className="px-4 sm:px-5 py-5 space-y-5">{children}</div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsTab() {
  const { user } = useAuth();
  // Guests are a virtual, never-persisted identity with no real email —
  // every real login (GitHub/Google/Admin) always has one.
  const isGuest = !user?.email;

  if (import.meta.env.DEV) {
    console.debug("[SettingsTab] user.email:", user?.email, "isGuest:", isGuest);
  }

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
  // Ticketing integrations
  const [githubIssuesRepo, setGithubIssuesRepo] = useState(PLATFORM_GITHUB_REPO);
  const [jiraDomain, setJiraDomain] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");

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
      // Auto-populate from saved settings; fall back to the known platform repo.
      setGithubIssuesRepo(settings.github_issues_repo ?? PLATFORM_GITHUB_REPO);
      setJiraDomain(settings.jira_domain ?? "");
      setJiraEmail(settings.jira_email ?? "");
      setJiraApiToken(settings.jira_api_token ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    if (isGuest) return; // Guests never get to persist changes to the shared demo account.
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
      const normalizedGithubIssuesRepo = normalizeGithubRepo(githubIssuesRepo);
      setGithubIssuesRepo(normalizedGithubIssuesRepo);
      body.github_issues_repo = normalizedGithubIssuesRepo;
      body.jira_domain = jiraDomain;
      body.jira_email = jiraEmail;
      // Don't overwrite a masked token with the placeholder dots.
      if (!jiraApiToken.includes("•")) body.jira_api_token = jiraApiToken;

      const res = await fetch("/api/me/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      toast.success("Settings saved");
      setTimeout(() => setSaved(false), 3000);
      // Keep the full key visible from localStorage — do not replace with masked server value.
      const storedAfterSave = getStoredOpenAIKey();
      if (storedAfterSave) setOpenaiKey(storedAfterSave);
      const storedGitHubAfterSave = getStoredGitHubToken();
      if (storedGitHubAfterSave) setGithubToken(storedGitHubAfterSave);
      // For Jira token: if the user entered a real value keep it visible; otherwise reload.
      if (!storedAfterSave && !storedGitHubAfterSave && !jiraApiToken) await loadSettings();
    } catch (e) {
      toast.error("Couldn't save settings", { description: e instanceof Error ? e.message : undefined });
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
        body: JSON.stringify({ coralogix_api_key: key, coralogix_region: coralogixRegion }),
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
  const githubRunnerActive = !!(data?.env_has_github_pat || hasRealGitHubToken);

  if (loading) {
    return (
      <TabContent>
        <div className="max-w-2xl mx-auto space-y-6" role="status" aria-label="Loading settings">
          {[2, 1, 3].map((fields, i) => (
            <div key={i} className="bg-surface-800/50 border border-surface-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-700">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="h-4 w-36" />
                </div>
                <Skeleton className="h-6 w-28 rounded-md" />
              </div>
              <div className="px-5 py-5 space-y-5">
                {Array.from({ length: fields }).map((_, j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TabContent>
    );
  }

  return (
    <TabContent>
      <div className="max-w-2xl mx-auto space-y-6">

        {isGuest && (
          <div className="flex items-start gap-2.5 bg-surface-800/60 border border-surface-700 rounded-xl px-4 py-3">
            <Lock className="w-4 h-4 text-slate-400 flex-shrink-0 mt-px" aria-hidden />
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="font-semibold text-slate-200">Read-only demo.</strong>{" "}
              Integration credentials are hidden and locked for guest visitors.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <ErrorBanner>
            <span className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
              {error}
            </span>
          </ErrorBanner>
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
            <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3.5 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-px" aria-hidden />
              <p className="text-xs text-emerald-300/90 leading-relaxed">
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
            disabled={isGuest}
            hint={
              data?.env_has_openai
                ? "Optional: your key takes priority over the backend environment key."
                : "Required for real AI generation. Saved automatically in this browser as you type."
            }
          />

          {serverHasOpenAI && !hasRealOpenAIKey && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
              A key is saved on your account — paste it here once to activate this browser.
            </p>
          )}

          {hasUserOpenAI && (
            <p className="text-xs text-sky-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
              Your key will be used for all generation and analysis requests.
            </p>
          )}

          <SecretInput
            id="anthropic-key"
            label="Anthropic API Key (optional)"
            value={anthropicKey}
            onChange={setAnthropicKey}
            placeholder="sk-ant-…"
            disabled={isGuest}
            hint="Fallback AI provider used when no OpenAI key is available."
          />
        </Section>

        {/* ── Cloud Test Runner (GitHub Actions) ─────────────────────────────── */}
        <Section
          icon={Github}
          title="Cloud Test Runner"
          badge={
            <StatusBadge
              active={githubRunnerActive}
              activeLabel="GitHub Actions Ready"
              inactiveLabel="Not Configured"
            />
          }
        >
          {data?.env_has_github_pat && (
            <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3.5 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-px" aria-hidden />
              <p className="text-xs text-emerald-300/90 leading-relaxed">
                Backend <code className="font-mono">GITHUB_ACTIONS_PAT</code> is set — all visitors can run tests without entering a token.
              </p>
            </div>
          )}
          <SecretInput
            id="github-token"
            label="GitHub Personal Access Token"
            value={githubToken}
            onChange={handleGitHubTokenChange}
            placeholder="ghp_… or github_pat_…"
            disabled={isGuest}
            hint={
              data?.env_has_github_pat
                ? "Optional: your personal token overrides the server token for this browser only."
                : "Required on Vercel to trigger Playwright runs via GitHub Actions. Needs repo scope. Or set GITHUB_ACTIONS_PAT in Vercel for all visitors."
            }
          />
          {hasRealGitHubToken && (
            <p className="text-xs text-sky-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
              Run Test will dispatch workflow <code className="font-mono">trigger-playwright-test</code> on ShakedGarame/QA-Genius.
            </p>
          )}
        </Section>

        {/* ── GitHub Issues Integration ──────────────────────────────────────── */}
        <Section
          icon={Github}
          title="GitHub Issues Integration"
          badge={
            <StatusBadge
              active={!!githubIssuesRepo}
              activeLabel="Configured"
              inactiveLabel="Not Configured"
            />
          }
        >
          <div>
            <FieldLabel htmlFor="github-issues-repo">Repository Path</FieldLabel>
            <FormInput
              id="github-issues-repo"
              type="text"
              value={githubIssuesRepo}
              onChange={(e) => setGithubIssuesRepo(e.target.value)}
              placeholder="owner/repo"
              disabled={isGuest}
              className="font-mono"
            />
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Issues created from failure analyses will be filed here. Format: <code className="font-mono">owner/repo</code>
            </p>
          </div>
          {githubIssuesRepo && (
            <p className="text-xs text-sky-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
              Issues will be created in <code className="font-mono">{githubIssuesRepo}</code>
            </p>
          )}
        </Section>

        {/* ── Jira Cloud Integration ─────────────────────────────────────────── */}
        <Section
          icon={TicketCheck}
          title="Jira Cloud Integration"
          badge={
            <StatusBadge
              active={!!(jiraDomain && jiraEmail && jiraApiToken)}
              activeLabel="Configured"
              inactiveLabel="Not Configured"
            />
          }
        >
          <div>
            <FieldLabel htmlFor="jira-domain">Jira Domain</FieldLabel>
            <FormInput
              id="jira-domain"
              type="text"
              value={jiraDomain}
              onChange={(e) => setJiraDomain(e.target.value)}
              placeholder="your-domain.atlassian.net"
              disabled={isGuest}
              className="font-mono"
            />
          </div>
          <div>
            <FieldLabel htmlFor="jira-email">Account Email</FieldLabel>
            <FormInput
              id="jira-email"
              type="email"
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              placeholder="name@company.com"
              disabled={isGuest}
            />
          </div>
          <SecretInput
            id="jira-api-token"
            label="API Token"
            value={jiraApiToken}
            onChange={setJiraApiToken}
            placeholder="Enter Jira API Token"
            disabled={isGuest}
            hint="Generate one at id.atlassian.com/manage-profile/security/api-tokens"
          />
          {jiraDomain && jiraEmail && jiraApiToken && (
            <p className="text-xs text-sky-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
              Jira tickets will be created on <code className="font-mono">{jiraDomain}</code>
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
            <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3.5 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-px" aria-hidden />
              <p className="text-xs text-emerald-300/90 leading-relaxed">
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
            disabled={isGuest}
            hint="Your Coralogix Logs Query API key. Enables live log fetching in the Log Analyzer."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="coralogix-team">Team Name</FieldLabel>
              <FormInput
                id="coralogix-team"
                type="text"
                value={coralogixTeam}
                onChange={(e) => setCoralogixTeam(e.target.value)}
                placeholder="my-team"
                disabled={isGuest}
              />
            </div>
            <div>
              <FieldLabel htmlFor="coralogix-region">Region</FieldLabel>
              <SelectInput
                id="coralogix-region"
                value={coralogixRegion}
                onChange={(e) => setCoralogixRegion(e.target.value)}
                disabled={isGuest}
              >
                <option value="EU">EU (Europe)</option>
                <option value="US">US (United States)</option>
                <option value="AP">AP (Asia-Pacific)</option>
              </SelectInput>
            </div>
          </div>

          {/* Test connection button */}
          <div className="flex items-center gap-3">
            <SecondaryButton
              onClick={testCoralogixConnection}
              disabled={!coralogixKey || testingCoralogix}
            >
              {testingCoralogix ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <Wifi className="w-3.5 h-3.5" aria-hidden />
              )}
              {testingCoralogix ? "Testing…" : "Test Connection"}
            </SecondaryButton>
            {coralogixStatus === "ok" && (
              <span role="status" className="flex items-center gap-1.5 text-xs text-emerald-400 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> Connected successfully
              </span>
            )}
            {coralogixStatus === "fail" && (
              <span role="status" className="flex items-center gap-1.5 text-xs text-red-400 animate-fade-in">
                <WifiOff className="w-3.5 h-3.5" /> Connection failed — check your key and region
              </span>
            )}
          </div>
        </Section>

        {/* ── 3. Local / Git Target ──────────────────────────────────────────── */}
        <Section icon={FolderOpen} title="Local / Git Target">
          <div>
            <FieldLabel htmlFor="tests-dir">Tests Output Directory</FieldLabel>
            <FormInput
              id="tests-dir"
              type="text"
              value={testsDir}
              onChange={(e) => setTestsDir(e.target.value)}
              placeholder="/Users/you/my-project/tests/e2e"
              disabled={isGuest}
              className="font-mono"
            />
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Absolute path where generated Playwright test folders are written.
              Defaults to <code className="font-mono">tests/generated/</code> inside the QA-Genius project root.
            </p>
          </div>
        </Section>

        {/* ── Save button ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 pb-4">
          <p className="text-xs text-slate-500">
            {isGuest
              ? "Settings are read-only in demo mode."
              : "Settings are saved per-account and never shared between users."}
          </p>
          {!isGuest && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={clsx(
                "pressable flex items-center justify-center gap-2 h-10 px-5 rounded-lg text-sm font-medium w-full sm:w-auto flex-shrink-0 border",
                FOCUS_RING,
                saved
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-sky-600 hover:bg-sky-500 text-white border-transparent shadow-sm shadow-black/30",
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
              {saving ? "Saving…" : saved ? "Saved" : "Save Settings"}
            </button>
          )}
        </div>
      </div>
    </TabContent>
  );
}
