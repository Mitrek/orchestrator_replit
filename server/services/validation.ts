
import { z } from "zod";

export const ALLOWED_DEVICES = ["desktop", "tablet", "mobile"] as const;

export const DEVICE_MAP = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 414, height: 896 }
};

export type Hotspot = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  element_type: "headline" | "cta" | "logo" | "hero" | "product" | "price" | "other";
  reason: string;
};

export function clampAndValidateHotspots(list: Hotspot[]): { kept: Hotspot[]; dropped: number } {
  const kept: Hotspot[] = [];
  let dropped = 0;

  for (const item of list) {
    // Check for NaN or invalid dimensions
    if (
      isNaN(item.x) || isNaN(item.y) || 
      isNaN(item.width) || isNaN(item.height) ||
      isNaN(item.confidence) ||
      item.width <= 0 || item.height <= 0
    ) {
      dropped++;
      continue;
    }

    // Clamp all numbers to [0,1]
    const clamped: Hotspot = {
      x: Math.max(0, Math.min(1, item.x)),
      y: Math.max(0, Math.min(1, item.y)),
      width: Math.max(0, Math.min(1, item.width)),
      height: Math.max(0, Math.min(1, item.height)),
      confidence: Math.max(0, Math.min(1, item.confidence)),
      element_type: item.element_type,
      reason: item.reason || ""
    };

    kept.push(clamped);
  }

  return { kept, dropped };
}

export function iou(a: Hotspot, b: Hotspot): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

export function greedyDeoverlap(list: Hotspot[], opts: { max: number; iouThreshold: number }): Hotspot[] {
  // Sort by confidence desc
  const sorted = [...list].sort((a, b) => b.confidence - a.confidence);
  const result: Hotspot[] = [];

  for (const hotspot of sorted) {
    // Check if this hotspot overlaps with any already kept
    let overlaps = false;
    for (const existing of result) {
      if (iou(hotspot, existing) >= opts.iouThreshold) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      result.push(hotspot);
    }

    // Stop at max
    if (result.length >= opts.max) break;
  }

  return result;
}
