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

  const deleteAnalysis = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/log-analyses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }, []);

  return { analyses, isLoading, error, refresh, deleteAnalysis };
}
