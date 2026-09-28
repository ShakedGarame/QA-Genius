import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "./hooks/useAuth";
import AppLayout from "./components/Layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import ShowcasePage from "./pages/ShowcasePage";

/** The authenticated app shell — everything that requires a QA-Genius session. */
function AuthGate() {
  const { status, user, logout, refresh, isLocalDev, isBackendDown } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-surface-600 border-t-sky-400 animate-spin" />
          <p className="text-sm text-slate-500">
            {isLocalDev ? "Starting local workspace…" : "Loading workspace…"}
          </p>
        </div>
      </div>
    );
  }

  if (isBackendDown && isLocalDev) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <p className="text-lg font-semibold text-white">Backend is starting…</p>
          <p className="text-sm text-slate-400">
            The server on port 3001 is not responding yet. Run{" "}
            <code className="text-sky-400 bg-surface-800 px-1.5 py-0.5 rounded">npm run dev</code>{" "}
            from the project folder if this persists.
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            className="pressable px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900"
          >
            Retry connection
          </button>
        </div>
      </div>
    );
  }

  // On localhost, useAuth() keeps retrying (status stays "loading") while the
  // backend auto-signs in as Guest Developer, so this normally never fires
  // there. It does fire — correctly — when auto-login is off
  // (LOCAL_DEV_AUTO_LOGIN=0) or genuinely fails, so the login screen must
  // still render on localhost rather than spinning forever.
  if (status === "unauthenticated" || !user) {
    return <LoginPage onLoginSuccess={refresh} />;
  }

  return <AppLayout user={user} onLogout={logout} />;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Bottom-center so toasts never collide with the assistant launcher (bottom-right). */}
      <Toaster
        theme="dark"
        position="bottom-center"
        offset={24}
        gap={8}
        toastOptions={{
          classNames: {
            toast: "!bg-surface-800 !border !border-surface-600 !text-slate-200 !rounded-xl !shadow-xl !shadow-black/40 !text-sm",
            description: "!text-slate-400",
            actionButton: "!bg-sky-600 !text-white",
            cancelButton: "!bg-surface-700 !text-slate-300",
          },
        }}
      />
      <Routes>
        {/* Public — no auth check, reachable without a QA-Genius session. */}
        <Route path="/showcase/:slug" element={<ShowcasePage />} />
        <Route path="*" element={<AuthGate />} />
      </Routes>
    </BrowserRouter>
  );
}
