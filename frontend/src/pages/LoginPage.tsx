import { useEffect, useState } from "react";
import { BrainCircuit, Loader2, Sparkles, ShieldCheck, LogIn, KeyRound, ArrowLeft } from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<"guest" | "admin">("guest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [googleAvailable, setGoogleAvailable] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const urlError = params.get("error");

  useEffect(() => {
    document.title = "Sign in — QA-Genius";
  }, []);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((data: { google?: boolean }) => setGoogleAvailable(!!data.google))
      .catch(() => setGoogleAvailable(false));
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/mock-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: "github" }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      // Clear any error params from URL without triggering a full reload
      window.history.replaceState({}, "", "/");
      onLoginSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoading(true);
    setAdminError(null);

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Server returned ${res.status}`);

      window.history.replaceState({}, "", "/");
      onLoginSuccess();
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center p-4">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(56,189,248,0.09) 0%, transparent 70%)",
        }}
      />

      <main className="relative z-10 w-full max-w-sm">
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-sky-900/40 mb-4">
            <BrainCircuit className="w-8 h-8 text-white" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-white">QA-Genius</h1>
          <p className="text-sm text-slate-400 mt-1">AI-Powered Test Automation Hub</p>
        </div>

        {/* Card */}
        <div className="bg-surface-800 border border-surface-600 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {mode === "guest" ? (
            <>
              <h2 className="text-lg font-semibold text-white text-center mb-1">
                Welcome to your workspace
              </h2>
              <p className="text-sm text-slate-400 text-center mb-6">
                This is an interactive demo environment. Enter as a guest to instantly generate, execute, and analyze automated tests with AI.
              </p>

              {/* URL-level error */}
              {urlError && !error && (
                <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-5">
                  <span>Sign-in failed. Please try again.</span>
                </div>
              )}

              {/* Runtime error */}
              {error && (
                <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-5">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={loading}
                className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 border border-sky-500 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                ) : (
                  <LogIn className="w-5 h-5" aria-hidden />
                )}
                {loading ? "Entering workspace…" : "Continue as Guest"}
              </button>

              <button
                type="button"
                onClick={() => { setMode("admin"); setError(null); }}
                className="flex items-center justify-center gap-1.5 w-full mt-3 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-lg"
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden />
                Owner Access — Sign in as Admin
              </button>

              {googleAvailable && (
                <a
                  href="/auth/google"
                  className="flex items-center justify-center gap-1.5 w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-lg"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden>
                    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.89c2.27-2.09 3.56-5.17 3.56-8.82z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.89-3c-1.08.73-2.46 1.16-4.06 1.16-3.13 0-5.78-2.11-6.72-4.96H1.27v3.1A12 12 0 0 0 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78z" />
                    <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4.01 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
                  </svg>
                  Sign in with Google
                </a>
              )}

              {/* Trust indicators */}
              <div className="flex items-center justify-center gap-4 mt-6 pt-5 border-t border-surface-600">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                  Session encrypted
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" aria-hidden />
                  AI-powered
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white text-center mb-1">
                Owner Access
              </h2>
              <p className="text-sm text-slate-400 text-center mb-6">
                Sign in with your admin credentials to manage integrations and settings.
              </p>

              {adminError && (
                <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-5">
                  <span>{adminError}</span>
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label htmlFor="admin-email" className="block text-xs font-medium text-slate-400 mb-1.5">
                    Email
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    required
                    autoComplete="username"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-surface-900 border border-surface-500 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                    Password
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-surface-900 border border-surface-500 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={adminLoading}
                  className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 border border-sky-500 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  {adminLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
                  ) : (
                    <KeyRound className="w-5 h-5" aria-hidden />
                  )}
                  {adminLoading ? "Signing in…" : "Sign in as Admin"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setMode("guest"); setAdminError(null); }}
                className="flex items-center justify-center gap-1.5 w-full mt-4 pt-4 border-t border-surface-600 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-lg"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
                Back to Guest Demo
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-slate-600 text-center mt-6">
          Built by{" "}
          <a
            href="https://github.com/ShakedGarame/QA-Genius"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors"
          >
            Shaked Garame
          </a>
        </p>
      </main>
    </div>
  );
}
