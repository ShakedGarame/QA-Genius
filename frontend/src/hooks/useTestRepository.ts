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

  // Deletes are optimistic: the UI updates immediately and rolls back if the
  // server rejects. Both resolve true/false so callers can toast the outcome.
  const deleteTest = useCallback(async (featureSlug: string, fileName: string): Promise<boolean> => {
    let featuresSnapshot: FeatureGroup[] = [];
    let testsSnapshot: TestFileInfo[] = [];
    setFeatures((prev) => {
      featuresSnapshot = prev;
      return prev.map((f) =>
        f.meta.slug === featureSlug
          ? { ...f, tests: f.tests.filter((t) => t.fileName !== fileName) }
          : f
      ).filter((f) => f.tests.length > 0);
    });
    setTests((prev) => {
      testsSnapshot = prev;
      return prev.filter((t) => !(t.featureSlug === featureSlug && t.fileName === fileName));
    });
    try {
      const res = await fetch(
        `/api/tests/${encodeURIComponent(featureSlug)}/${encodeURIComponent(fileName)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("Delete failed");
      return true;
    } catch {
      setFeatures(featuresSnapshot);
      setTests(testsSnapshot);
      return false;
    }
  }, []);

  const deleteFeature = useCallback(async (featureSlug: string): Promise<boolean> => {
    let featuresSnapshot: FeatureGroup[] = [];
    let testsSnapshot: TestFileInfo[] = [];
    setFeatures((prev) => { featuresSnapshot = prev; return prev.filter((f) => f.meta.slug !== featureSlug); });
    setTests((prev) => { testsSnapshot = prev; return prev.filter((t) => t.featureSlug !== featureSlug); });
    try {
      const res = await fetch(`/api/tests/${encodeURIComponent(featureSlug)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      return true;
    } catch {
      setFeatures(featuresSnapshot);
      setTests(testsSnapshot);
      return false;
    }
  }, []);

  return { features, tests, isLoading, error, refresh, deleteTest, deleteFeature };
}
