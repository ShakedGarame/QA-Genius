import { buildGitHubTokenHeaders } from "./githubToken";
import type { RunArtifactGallery } from "../types";

export async function fetchRunArtifacts(cloudRunId: number): Promise<RunArtifactGallery | null> {
  try {
    const res = await fetch(`/api/run-test/artifacts/${cloudRunId}`, {
      credentials: "include",
      headers: buildGitHubTokenHeaders(),
    });
    const json = await res.json();
    if (!res.ok) return null;
    return {
      runId: Number(json.runId ?? cloudRunId),
      artifacts: json.artifacts ?? [],
      screenshots: json.screenshots ?? [],
    };
  } catch {
    return null;
  }
}
