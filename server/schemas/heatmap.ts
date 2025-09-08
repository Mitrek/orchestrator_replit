
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
 * Simplified to base64-only response.
 */
export const heatmapRequestSchema = z.object({
  url: z.string().url("Invalid URL format"),
  device: z.enum(["desktop", "tablet", "mobile"]).optional().default("desktop")
});

/**
 * Schema for /api/v1/heatmap/data (data-driven).
 * Extends the base schema with dataPoints[].
 */
export const heatmapDataRequestSchema = baseHeatmapSchema.extend({
 returnMode: z.enum(["base64", "url"]).optional().default("base64"),
 dataPoints: z
    .array(
      z.object({
        x: z.number().min(0, "x must be >= 0").max(1, "x must be <= 1"),
        y: z.number().min(0, "y must be >= 0").max(1, "y must be <= 1"),
        type: z.enum(["move", "click"]).optional(),
      }),
    )
    .min(1, "At least one dataPoint is required")
    .max(5000, "Too many dataPoints"),
 // Step-2 knobs
 alpha: z.number().optional(),
 radiusPx: z.number().optional(),
 blurPx: z.number().optional(),
 // Step-3 knobs
 blendMode: z.enum(["lighter", "source-over"]).optional().default("lighter"),
 ramp: z.enum(["classic", "soft"]).optional().default("classic"),
 clipLowPercent: z.number().optional().default(0),
 clipHighPercent: z.number().optional().default(100),
});

// Inferred TypeScript types (optional but recommended)
export type HeatmapRequest = z.infer<typeof heatmapRequestSchema>;
export type HeatmapDataRequest = z.infer<typeof heatmapDataRequestSchema>;
