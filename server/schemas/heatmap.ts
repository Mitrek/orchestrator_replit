
// FILE: server/schemas/heatmap.ts
import { z } from "zod";

/**
 * Common fields used by both endpoints.
 */
export const baseHeatmapSchema = z.object({
 url: z.string().url("Must be a valid URL starting with http:// or https://"),
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
