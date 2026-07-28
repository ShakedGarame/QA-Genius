import { useEffect, useState, useCallback, useRef } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  hasOpenAI: boolean;
  hasAnthropic: boolean;
  hasCoralogix: boolean;
  hasJira: boolean;
}

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" }
  | { status: "backend_down" };

const isLocalDev =
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"));

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const retriesRef = useRef(0);

  const fetchMe = useCallback(async () => {
    try {
      // Fired in parallel, not sequentially — /api/me doesn't depend on /health,
      // so awaiting them one after another was adding a full extra round-trip
      // to every boot.
      const [health, res] = await Promise.all([
        fetch("/health"),
        fetch("/api/me", { credentials: "include" }),
      ]);
      if (!health.ok) throw new Error("Backend unavailable");

      if (res.status === 401) {
        if (isLocalDev) {
          // Backend auto-guest should handle this — retry briefly
          if (retriesRef.current < 6) {
            retriesRef.current += 1;
            setState({ status: "loading" });
            window.setTimeout(() => { void fetchMe(); }, 1500);
            return;
          }
        }
        setState({ status: "unauthenticated" });
        return;
      }
      if (!res.ok) throw new Error("Server error");
      retriesRef.current = 0;
      const user: AuthUser = await res.json();
      setState({ status: "authenticated", user });
    } catch {
      if (isLocalDev && retriesRef.current < 12) {
        retriesRef.current += 1;
        setState({ status: "loading" });
        window.setTimeout(() => { void fetchMe(); }, 2000);
        return;
      }
      setState(isLocalDev ? { status: "backend_down" } : { status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* network issue — proceed to clear local state anyway */ }
    setState({ status: "unauthenticated" });
  }, []);

  return {
    status: state.status,
    user: state.status === "authenticated" ? state.user : null,
    isLoading: state.status === "loading",
    isAuthenticated: state.status === "authenticated",
    isBackendDown: state.status === "backend_down",
    isLocalDev,
    logout,
    refresh: fetchMe,
  };
}
