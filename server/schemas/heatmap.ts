
// FILE: server/schemas/heatmap.ts
import { isIP } from "node:net";
import { z } from "zod";

function isSafeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    const host = parsed.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1")
      return false;

    if (isIP(host) === 4) {
      const [a, b] = host.split(".").map(Number);
      if (a === 10) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 127) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Common fields used by both endpoints.
 */
export const baseHeatmapSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL starting with http:// or https://")
    .max(2048, "URL must be at most 2048 characters")
    .refine(
      (u) => isSafeUrl(u),
      "URL must use http/https and not point to localhost or private IPs"
    ),
  device: z.enum(["desktop", "tablet", "mobile"]).optional().default("desktop"),
});

/**
 * Schema for /api/v1/heatmap (AI-assisted).
 * Accepts an optional knobs object for future tuning.
 */
export const heatmapRequestSchema = baseHeatmapSchema.extend({
  knobs: z.record(z.any()).optional(),
});

/**
 * Schema for /api/v1/heatmap/data (data-driven).
 * Uses jsonl string payload instead of array of points.
 */
export const heatmapDataRequestSchema = baseHeatmapSchema.extend({
  jsonl: z.string().min(1, "jsonl string is required"),
});

// Inferred TypeScript types (optional but recommended)
export type HeatmapRequest = z.infer<typeof heatmapRequestSchema>;
export type HeatmapDataRequest = z.infer<typeof heatmapDataRequestSchema>;
