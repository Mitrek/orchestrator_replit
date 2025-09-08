
import { getAiHotspotsPhase7 } from "./aiHotspots";
import { getAiHotspotsLegacy } from "./aiHotspots.legacy";
import { getScreenshotBuffer } from "./screenshot";
import { hotspotsToPoints } from "./hotspotsToPoints";
import { renderFromPoints, type RenderKnobs } from "./renderer";
import { ALLOWED_DEVICES, DEVICE_MAP, clampAndValidateHotspots, greedyDeoverlap, type Hotspot } from "./validation";

export async function makeAiHeatmapImage(params: {
  url: string;
  device: "desktop" | "tablet" | "mobile";
  engine: "phase7" | "legacy";
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
      engine: "legacy" | "phase7";
      model: "legacy" | "gpt-4o-mini";
      fallback: boolean;
      promptHash?: string;
      checksumOk?: boolean;
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
  const { url, device, engine, parity, knobs } = params;

  // Validate device
  if (!ALLOWED_DEVICES.includes(device as any)) {
    throw new Error(`Invalid device: ${device}`);
  }

  const viewport = DEVICE_MAP[device];

  // Get screenshot
  const { png: screenshotPng } = await getScreenshotBuffer(url, device);

  // Fetch hotspots based on engine
  let hotspotsResult;
  if (engine === "legacy") {
    hotspotsResult = await getAiHotspotsLegacy({ url, device, parity });
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
    knobs
  });

  const base64 = `data:image/png;base64,${heatPng.toString("base64")}`;
  const durationMs = Date.now() - startTime;

  return {
    base64,
    meta: {
      phase: "phase7",
      engine: "ai",
      device,
      viewport,
      ai: {
        engine: hotspotsResult.meta.engine,
        model: hotspotsResult.meta.engine === "legacy" ? "legacy" : hotspotsResult.meta.model || "gpt-4o-mini",
        fallback: hotspotsResult.meta.fallback || false,
        promptHash: hotspotsResult.meta.promptHash,
        checksumOk: hotspotsResult.meta.checksumOk,
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
