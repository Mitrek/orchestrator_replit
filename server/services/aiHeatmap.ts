
import { getAiHotspotsPhase7 } from "./aiHotspots";
import { getScreenshotBuffer } from "./screenshot";
import { hotspotsToPoints } from "./hotspotsToPoints";
import { renderFromPoints, type RenderKnobs } from "./renderer";
import { ALLOWED_DEVICES, DEVICE_MAP, clampAndValidateHotspots, greedyDeoverlap, type Hotspot } from "./validation";
import * as hotspotsCache from "./hotspotsCache";

export async function makeAiHeatmapImage(params: {
  url: string;
  device: "desktop" | "tablet" | "mobile";
  parity: boolean;
  knobs?: Partial<RenderKnobs>;
}): Promise<{
  base64: string;
  meta: {
    phase: "phase7";
    engine: "ai";
    device: string;
    viewport: { width: number; height: number };
    ai: {
      engine: "phase7";
      model: "gpt-4o-mini";
      fallback: boolean;
      promptHash: string;
      cached?: boolean;
      requested: number;
      accepted: number;
      pruned: number;
      parity: boolean;
    };
    durationMs: number;
    timestamp: string;
  };
}> {
  const startTime = Date.now();
  const { url, device, parity, knobs } = params;

  // Validate device
  if (!ALLOWED_DEVICES.includes(device as any)) {
    throw new Error(`Invalid device: ${device}`);
  }

  const viewport = DEVICE_MAP[device];
  
  // Clamp knobs to safe ranges
  const clampedKnobs = knobs ? {
    ...knobs,
    alpha: knobs.alpha ? Math.max(0.1, Math.min(1, knobs.alpha)) : knobs.alpha,
    kernelRadiusPx: knobs.kernelRadiusPx ? Math.max(8, Math.min(96, knobs.kernelRadiusPx)) : knobs.kernelRadiusPx,
    kernelSigmaPx: knobs.kernelSigmaPx ? Math.max(2, Math.min(48, knobs.kernelSigmaPx)) : knobs.kernelSigmaPx
  } : undefined;

  // Get screenshot
  const { png: screenshotPng } = await getScreenshotBuffer(url, device);

  // Check cache first
  const cacheEnabled = process.env.HOTSPOTS_CACHE !== "false";
  let hotspotsResult;
  let cached = false;

  if (cacheEnabled) {
    // Need promptHash for cache key, so do a quick call to get it
    const tempResult = await getAiHotspotsPhase7({ url, device, parity });
    const cacheKey = hotspotsCache.key({ url, device, parity, promptHash: tempResult.meta.promptHash });
    const cachedEntry = hotspotsCache.get(cacheKey);
    
    if (cachedEntry) {
      hotspotsResult = {
        hotspots: cachedEntry.hotspots,
        meta: { ...cachedEntry.meta, cached: true }
      };
      cached = true;
    } else {
      hotspotsResult = tempResult;
      hotspotsCache.set(cacheKey, hotspotsResult.hotspots, hotspotsResult.meta);
    }
  } else {
    hotspotsResult = await getAiHotspotsPhase7({ url, device, parity });
  }

  // Sanitize hotspots again (belt & suspenders)
  const { kept } = clampAndValidateHotspots(hotspotsResult.hotspots);
  let filtered = kept;
  if (parity) {
    filtered = kept.filter(h => h.confidence >= 0.25);
  }
  const finalHotspots = greedyDeoverlap(filtered, { max: 8, iouThreshold: 0.4 });

  // Convert hotspots to points
  const points = hotspotsToPoints(finalHotspots, viewport, 800);

  // Render heatmap
  const heatPng = await renderFromPoints({
    screenshotPng,
    viewport,
    points,
    knobs: clampedKnobs
  });

  const base64 = `data:image/png;base64,${heatPng.toString("base64")}`;
  const durationMs = Date.now() - startTime;

  // Log structured line
  console.log(JSON.stringify({
    route: "/api/v1/heatmap",
    url,
    device,
    cached,
    points: points.length,
    hotspotsCount: finalHotspots.length,
    durationMs,
    fallback: hotspotsResult.meta.fallback
  }));

  return {
    base64,
    meta: {
      phase: "phase7",
      engine: "ai",
      device,
      viewport,
      ai: {
        engine: "phase7",
        model: "gpt-4o-mini",
        fallback: hotspotsResult.meta.fallback || false,
        promptHash: hotspotsResult.meta.promptHash,
        cached,
        requested: hotspotsResult.meta.requested,
        accepted: finalHotspots.length,
        pruned: hotspotsResult.meta.requested - finalHotspots.length,
        parity
      },
      durationMs,
      timestamp: new Date().toISOString()
    }
  };
}
