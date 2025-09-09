// server/health.ts
import { config } from "../config/index.js";

// Capture start time once per process
const STARTED_AT = new Date();

// Try to read a version/commit from env (set by your deploy), fallback to "dev"
const APP_VERSION = process.env.APP_VERSION || process.env.COMMIT_SHA || "dev";

export type HealthReport = {
  status: "ok" | "degraded" | "error";
  version: string;
  startedAt: string;
  uptimeSeconds: number;
  node: string;
  features: {
    heatmap: { enabled: boolean };
  };
  envReady: {
    openaiKeyPresent: boolean;
  };
  services: {
    puppeteer: "unchecked" | "ok" | "failed";
    canvas: "unchecked" | "ok" | "failed";
    storage: "unchecked" | "ok" | "failed";
  };
  notes?: string[];
};

export function buildHealthReport(): HealthReport {
  const now = new Date();
  const uptimeSeconds = Math.floor(
    (now.getTime() - STARTED_AT.getTime()) / 1000,
  );

  const heatmapEnabled = !!config.heatmap.enabled;
  const openaiKeyPresent = !!config.openai.apiKey;

  // Phase 0 defaults: we don't check heavy things here
  let status: HealthReport["status"] = "ok";
  const notes: string[] = [];

  // Example policy: if heatmap is enabled but OpenAI key is missing, mark degraded
  if (heatmapEnabled && !openaiKeyPresent) {
    status = "degraded";
    notes.push(
      "HEATMAP_ENABLED is true but OPENAI_API_KEY is not set; AI overlay may fallback or fail.",
    );
  }

  const report: HealthReport = {
    status,
    version: APP_VERSION,
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds,
    node: process.version,
    features: {
      heatmap: { enabled: heatmapEnabled },
    },
    envReady: {
      openaiKeyPresent,
    },
    services: {
      puppeteer: "unchecked",
      canvas: "unchecked",
      storage: "unchecked",
    },
  };

  if (notes.length) report.notes = notes;
  return report;
}
export function healthHandler(_req: any, res: any) {
  res.status(200).send("ok");
}
