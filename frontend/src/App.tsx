import { useAuth } from "./hooks/useAuth";
import AppLayout from "./components/Layout/AppLayout";
import LoginPage from "./pages/LoginPage";

export default function App() {
  const { status, user, logout, refresh, isLocalDev, isBackendDown } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
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
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium"
          >
            Retry connection
          </button>
        </div>
      </div>
    );
  }

  // Skip login screen on localhost — backend auto-signs in as Guest Developer
  if ((status === "unauthenticated" || !user) && !isLocalDev) {
    return <LoginPage onLoginSuccess={refresh} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return <AppLayout user={user} onLogout={logout} />;
}
