import https from "https";
import type { DbUserSettings } from "../db.js";

interface CoralogixLog {
  text: string;
  severity: number;
  timestamp: string;
  applicationName?: string;
  subsystemName?: string;
}

function regionHost(region: string): string {
  switch (region.toUpperCase()) {
    case "US":
      return "api.coralogix.us";
    case "AP":
      return "api.ap1.coralogix.com";
    default:
      return "api.coralogix.com"; // EU default
  }
}

/**
 * Queries the Coralogix DataPrime API for logs matching a Lucene query over the
 * last `minutes` and returns them as newline-joined, human-readable entries.
 */
export async function fetchCoralogixLogs(
  apiKey: string,
  region: string,
  query: string,
  minutes = 30
): Promise<string> {
  const endTime = Date.now();
  const startTime = endTime - minutes * 60 * 1000;

  const payload = JSON.stringify({
    query: { lucene: query || "*" },
    metadata: {
      tier: ["TIER_UNSPECIFIED"],
      syntax: "QUERY_SYNTAX_LUCENE",
      startDate: new Date(startTime).toISOString(),
      endDate: new Date(endTime).toISOString(),
      defaultSource: "tailing",
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: regionHost(region),
        path: "/api/v1/dataprime/query",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 8000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Coralogix API error ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          // Coralogix returns newline-delimited JSON
          const lines = body.trim().split("\n").filter(Boolean);
          const entries: string[] = [];
          for (const line of lines.slice(0, 50)) {
            try {
              const obj = JSON.parse(line) as { result?: { results?: CoralogixLog[] } };
              const results = obj?.result?.results ?? [];
              for (const r of results) {
                entries.push(`[${r.timestamp ?? ""}] [${r.severity ?? "INFO"}] ${r.applicationName ?? "app"}: ${r.text ?? ""}`);
              }
            } catch { /* skip malformed lines */ }
          }
          resolve(entries.join("\n") || "(no logs returned for the selected time window)");
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Coralogix request timed out")); });
    req.write(payload);
    req.end();
  });
}

/** Resolves the effective Coralogix API key + region: user settings take priority over env vars. */
export function resolveCoralogixConfig(userSettings: DbUserSettings | null): {
  apiKey: string | null;
  region: string;
} {
  const apiKey = userSettings?.coralogix_api_key || process.env.CORALOGIX_API_KEY || null;
  const region = userSettings?.coralogix_region ?? process.env.CORALOGIX_REGION ?? "EU";
  return { apiKey, region };
}
