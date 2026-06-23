import { useState } from "react";
import { ParsedPrd, GenerateTestsResult } from "../types";
import { buildOpenAIKeyHeaders, readOpenAIKeyForRequest } from "../lib/apiKeys";

export interface GenerateResult extends GenerateTestsResult {
  savedAs?: string;
}

export function useTestGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async (prd: ParsedPrd): Promise<GenerateResult | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      const userKey = readOpenAIKeyForRequest();
      const res = await fetch("/api/generate-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildOpenAIKeyHeaders() },
        credentials: "include",
        body: JSON.stringify({
          prdText: prd.rawText,
          fileName: prd.fileName,
          ...(userKey ? { openaiApiKey: userKey } : {}),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");

      const r: GenerateResult = { ...(json.data as GenerateTestsResult), savedAs: json.savedAs };
      setResult(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { isGenerating, result, error, generate, reset };
}
