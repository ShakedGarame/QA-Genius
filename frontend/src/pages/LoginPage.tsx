import { useEffect, useState } from "react";
import { BrainCircuit, Loader2, Sparkles, ShieldCheck, LogIn } from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const urlError = params.get("error");

  useEffect(() => {
    document.title = "Sign in — QA-Genius";
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
            This is a live portfolio demo — enter as a shared guest to generate, run, and analyse tests with AI.
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
