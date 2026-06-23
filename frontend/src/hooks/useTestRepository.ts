import { useState, useCallback } from "react";
import { FeatureGroup, TestFileInfo } from "../types";

export function useTestRepository() {
  const [features, setFeatures] = useState<FeatureGroup[]>([]);
  const [tests, setTests] = useState<TestFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tests", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load tests");
      setFeatures(json.features ?? []);
      setTests(json.tests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tests");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteTest = useCallback(async (featureSlug: string, fileName: string) => {
    try {
      const res = await fetch(
        `/api/tests/${encodeURIComponent(featureSlug)}/${encodeURIComponent(fileName)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("Delete failed");
      setFeatures((prev) =>
        prev.map((f) =>
          f.meta.slug === featureSlug
            ? { ...f, tests: f.tests.filter((t) => t.fileName !== fileName) }
            : f
        ).filter((f) => f.tests.length > 0)
      );
      setTests((prev) => prev.filter((t) => !(t.featureSlug === featureSlug && t.fileName === fileName)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }, []);

  const deleteFeature = useCallback(async (featureSlug: string) => {
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(featureSlug)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      setFeatures((prev) => prev.filter((f) => f.meta.slug !== featureSlug));
      setTests((prev) => prev.filter((t) => t.featureSlug !== featureSlug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }, []);

  return { features, tests, isLoading, error, refresh, deleteTest, deleteFeature };
}
