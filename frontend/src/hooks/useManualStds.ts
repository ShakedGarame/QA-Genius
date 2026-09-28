import { useState, useCallback } from "react";
import { ManualStdRecord } from "../types";

export function useManualStds() {
  const [stds, setStds] = useState<ManualStdRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/manual-std", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load saved STDs");
      setStds(json.stds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load saved STDs");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Optimistic: the row disappears immediately and is restored if the server
  // rejects the delete. Resolves true/false so callers can toast the outcome.
  const deleteStd = useCallback(async (id: string): Promise<boolean> => {
    let snapshot: ManualStdRecord[] = [];
    setStds((prev) => { snapshot = prev; return prev.filter((s) => s.id !== id); });
    try {
      const res = await fetch(`/api/manual-std/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      return true;
    } catch {
      setStds(snapshot);
      return false;
    }
  }, []);

  return { stds, isLoading, error, refresh, deleteStd };
}
