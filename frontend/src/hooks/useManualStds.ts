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

  const deleteStd = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/manual-std/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setStds((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }, []);

  return { stds, isLoading, error, refresh, deleteStd };
}
