/** Browser-local OpenAI key used for authenticated AI requests. */
export const OPENAI_API_KEY_STORAGE = "OPENAI_API_KEY";

export function getStoredOpenAIKey(): string | null {
  try {
    const key = localStorage.getItem(OPENAI_API_KEY_STORAGE)?.trim();
    return key || null;
  } catch {
    return null;
  }
}

export function setStoredOpenAIKey(key: string | null): void {
  try {
    if (key?.trim()) {
      localStorage.setItem(OPENAI_API_KEY_STORAGE, key.trim());
    } else {
      localStorage.removeItem(OPENAI_API_KEY_STORAGE);
    }
  } catch {
    // localStorage unavailable (private mode, etc.)
  }
}

/** Headers to attach to backend AI routes when a client-side key is available. */
export function buildOpenAIKeyHeaders(): Record<string, string> {
  const key = getStoredOpenAIKey();
  if (!key) return {};
  return { "x-openai-key": key };
}
