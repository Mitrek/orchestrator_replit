// FILE: server/schemas/heatmap.ts
import { z } from "zod";

/**
 * Common fields used by both endpoints.
 */
export const baseHeatmapSchema = z.object({
  url: z.string().url("Must be a valid URL starting with http:// or https://"),

  device: z.enum(["desktop", "tablet", "mobile"]).optional().default("desktop"),

  returnMode: z.enum(["base64", "url"]).optional().default("base64"),
});

/**
 * Schema for /api/v1/heatmap (AI-assisted).
 * Only needs the base fields for now.
 */
export const heatmapRequestSchema = baseHeatmapSchema;

/**
 * Schema for /api/v1/heatmap/data (data-driven).
 * Extends the base schema with dataPoints[].
 */
export const heatmapDataRequestSchema = baseHeatmapSchema.extend({
  dataPoints: z
    .array(
      z.object({
        x: z.number().min(0, "x must be >= 0").max(1, "x must be <= 1"),
        y: z.number().min(0, "y must be >= 0").max(1, "y must be <= 1"),
        type: z.enum(["move", "click"]).optional(),
      }),
    )
    .min(1, "At least one dataPoint is required")
    .max(10000, "Too many dataPoints"),
});

// Inferred TypeScript types (optional but recommended)
export type HeatmapRequest = z.infer<typeof heatmapRequestSchema>;
export type HeatmapDataRequest = z.infer<typeof heatmapDataRequestSchema>;
