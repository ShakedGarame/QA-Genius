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

/** True when the value looks like a real key (not the server masked placeholder). */
export function isRealOpenAIKey(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  if (value.includes("•")) return false;
  return value.startsWith("sk-");
}

/** Persist while typing so refresh + generate work without relying on Save alone. */
export function syncOpenAIKeyToStorage(value: string): void {
  if (value.includes("•")) return;
  if (isRealOpenAIKey(value)) {
    setStoredOpenAIKey(value.trim());
  } else if (!value.trim()) {
    setStoredOpenAIKey(null);
  }
}

/** Headers to attach to backend AI routes when a client-side key is available. */
export function buildOpenAIKeyHeaders(): Record<string, string> {
  const key = getStoredOpenAIKey();
  if (!key) return {};
  return {
    "x-user-openai-key": key,
    "x-openai-key": key,
  };
}

/** Read key fresh from storage right before a network call. */
export function readOpenAIKeyForRequest(): string | null {
  return getStoredOpenAIKey();
}
