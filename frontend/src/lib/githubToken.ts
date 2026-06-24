/** Browser-local GitHub PAT for triggering repository_dispatch workflows. */
export const GITHUB_TOKEN_STORAGE = "GITHUB_TOKEN";

export function getStoredGitHubToken(): string | null {
  try {
    const token = localStorage.getItem(GITHUB_TOKEN_STORAGE)?.trim();
    return token || null;
  } catch {
    return null;
  }
}

export function setStoredGitHubToken(token: string | null): void {
  try {
    if (token?.trim()) {
      localStorage.setItem(GITHUB_TOKEN_STORAGE, token.trim());
    } else {
      localStorage.removeItem(GITHUB_TOKEN_STORAGE);
    }
  } catch {
    // ignore
  }
}

export function isRealGitHubToken(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  if (value.includes("•")) return false;
  return value.startsWith("ghp_") || value.startsWith("github_pat_");
}

export function syncGitHubTokenToStorage(value: string): void {
  if (value.includes("•")) return;
  if (isRealGitHubToken(value)) {
    setStoredGitHubToken(value.trim());
  } else if (!value.trim()) {
    setStoredGitHubToken(null);
  }
}

export function buildGitHubTokenHeaders(): Record<string, string> {
  const token = getStoredGitHubToken();
  if (!token) return {};
  return {
    "x-user-github-token": token,
    "x-github-token": token,
  };
}

export function readGitHubTokenForRequest(): string | null {
  return getStoredGitHubToken();
}
