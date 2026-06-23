import { useAuth } from "./hooks/useAuth";
import AppLayout from "./components/Layout/AppLayout";
import LoginPage from "./pages/LoginPage";

export default function App() {
  const { status, user, logout, refresh } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          <p className="text-sm text-slate-500">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" || !user) {
    return <LoginPage onLoginSuccess={refresh} />;
  }

  return <AppLayout user={user} onLogout={logout} />;
}
