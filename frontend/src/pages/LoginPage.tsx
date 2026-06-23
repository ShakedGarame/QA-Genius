import { useEffect, useState } from "react";
import { BrainCircuit, Github, Loader2, Sparkles, ShieldCheck } from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

type LoginProvider = "github" | "google" | null;

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loading, setLoading] = useState<LoginProvider>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const urlError = params.get("error");

  useEffect(() => {
    document.title = "Sign in — QA-Genius";
  }, []);

  const handleLogin = async (provider: "github" | "google") => {
    setLoading(provider);
    setError(null);

    // Check if real OAuth is configured for this provider
    try {
      const providersRes = await fetch("/api/auth/providers");
      const providers = await providersRes.json() as { github: boolean; google: boolean };

      if (providers[provider]) {
        // Real OAuth — redirect to backend (will leave this page)
        window.location.href = `/auth/${provider}`;
        return;
      }
    } catch { /* network issue — fall through to mock */ }

    // Simulate OAuth handshake delay for a realistic UX
    await new Promise((r) => setTimeout(r, 1000));

    try {
      const res = await fetch("/api/auth/mock-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      // Clear any error params from URL without triggering a full reload
      window.history.replaceState({}, "", "/");
      onLoginSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
      setLoading(null);
    }
  };

  const isAnyLoading = loading !== null;

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
        <div className="bg-surface-800 border border-surface-600 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white text-center mb-1">
            Welcome to your workspace
          </h2>
          <p className="text-sm text-slate-400 text-center mb-6">
            Sign in to generate, run, and analyse tests with AI.
          </p>

          {/* URL-level error (real OAuth failure) */}
          {urlError && !error && (
            <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-5">
              <span>Sign-in failed. Please try again or use the other provider.</span>
            </div>
          )}

          {/* Runtime error */}
          {error && (
            <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-5">
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            {/* GitHub */}
            <button
              type="button"
              onClick={() => handleLogin("github")}
              disabled={isAnyLoading}
              className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-surface-700 hover:bg-surface-600 border border-surface-500 hover:border-surface-400 rounded-xl text-sm font-medium text-slate-100 transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {loading === "github" ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
              ) : (
                <Github className="w-5 h-5" aria-hidden />
              )}
              {loading === "github" ? "Connecting…" : "Continue with GitHub"}
            </button>

            {/* Google */}
            <button
              type="button"
              onClick={() => handleLogin("google")}
              disabled={isAnyLoading}
              className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {loading === "google" ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" aria-hidden />
              ) : (
                <GoogleIcon className="w-5 h-5" />
              )}
              {loading === "google" ? "Connecting…" : "Continue with Google"}
            </button>
          </div>

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
        </div>

        <p className="text-xs text-slate-600 text-center mt-6">
          Built by{" "}
          <a
            href="https://github.com/shakedgarame"
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
