import { useEffect, useState, useCallback } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  hasOpenAI: boolean;
  hasAnthropic: boolean;
  hasCoralogix: boolean;
}

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (res.status === 401) {
        setState({ status: "unauthenticated" });
        return;
      }
      if (!res.ok) throw new Error("Server error");
      const user: AuthUser = await res.json();
      setState({ status: "authenticated", user });
    } catch {
      setState({ status: "unauthenticated" });
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
    logout,
    refresh: fetchMe,
  };
}
