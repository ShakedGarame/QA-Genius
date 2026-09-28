import { useState, useCallback } from "react";
import { LogAnalysisRecord } from "../types";

export function useLogHistory() {
  const [analyses, setAnalyses] = useState<LogAnalysisRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/log-analyses", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load log history");
      setAnalyses(json.analyses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load log history");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Optimistic: removed immediately, restored on failure. Resolves true/false.
  const deleteAnalysis = useCallback(async (id: string): Promise<boolean> => {
    let snapshot: LogAnalysisRecord[] = [];
    setAnalyses((prev) => { snapshot = prev; return prev.filter((a) => a.id !== id); });
    try {
      const res = await fetch(`/api/log-analyses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      return true;
    } catch {
      setAnalyses(snapshot);
      return false;
    }
  }, []);

  return { analyses, isLoading, error, refresh, deleteAnalysis };
}
