import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getExternalScreenshotBase64 } from "./screenshotExternal";
import { getScreenshotBuffer } from "./screenshot";

/** Devices supported by the service */
type Device = "desktop" | "tablet" | "mobile";

/** Common request args */
interface HeatmapArgs {
  url: string;
  device?: Device;
  reqId?: string;
}

/** Data heatmap args (client-provided normalized points) */
interface DataHeatmapArgs extends HeatmapArgs {
  dataPoints: Array<{
    x: number;                  // normalized 0..1
    y: number;                  // normalized 0..1
    type?: "click" | "move";
  }>;
}

/** Common response envelope */
interface HeatmapResponse {
  base64: string;
  meta: {
    sourceUrl: string;
    device: Device;
    viewport: { width: number; height: number };
    engine: "ai" | "data";
    durationMs: number;
    timestamp: string;
    phase: "phase10";
    reqId?: string;
  };
}

/** Default device viewports (used until we have real screenshot dims) */
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet:  { width: 1024, height: 768 },
  mobile:  { width: 414,  height: 896 },
} as const;

/** Sanity minimum PNG payload to reject 1×1/dummy screenshots */
const MIN_PNG_BYTES = 1200;

/* -------------------------
 * Validation & Sanitizers
 * ------------------------- */

function validateUrl(url: string): void {
  if (!url || typeof url !== "string") throw new Error("URL is required");
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }
}

function sanitizeDevice(device?: Device): Device {
  const d = (device || "").toLowerCase() as Device;
  return (d === "desktop" || d === "tablet" || d === "mobile") ? d : "desktop";
}

function sanitizeDataPoints(
  dataPoints: any[]
): Array<{ x: number; y: number; type?: "click" | "move" }> {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
    throw new Error("dataPoints[] required");
  }
  return dataPoints.map((p) => ({
    x: clamp01(Number(p?.x)),
    y: clamp01(Number(p?.y)),
    type: (p?.type === "click" || p?.type === "move") ? p.type : "move",
  }));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/* -------------------------
 * AI Hotspots (deterministic)
 * ------------------------- */

function generateAIHotspots(viewport: { width: number; height: number }): Array<{
  x: number; y: number; intensity: number;
}> {
  // Simple, deterministic hotspots (pixel coords)
  return [
    { x: viewport.width * 0.50, y: viewport.height * 0.20, intensity: 0.8 },
    { x: viewport.width * 0.30, y: viewport.height * 0.40, intensity: 0.6 },
    { x: viewport.width * 0.70, y: viewport.height * 0.60, intensity: 0.7 },
    { x: viewport.width * 0.50, y: viewport.height * 0.80, intensity: 0.5 },
  ];
}

/* -------------------------
 * Rendering
 * ------------------------- */

async function renderHeatmapToCanvas(
  screenshotBase64: string,
  hotspots: Array<{ x: number; y: number; intensity: number }>,
  viewport: { width: number; height: number }
): Promise<string> {
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");

  // Decode screenshot
  const imageData = screenshotBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const buf = Buffer.from(imageData, "base64");
  const img = await loadImage(buf);

  // Draw screenshot
  ctx.drawImage(img, 0, 0, viewport.width, viewport.height);

  // Draw heat layer to offscreen
  const heatCanvas = createCanvas(viewport.width, viewport.height);
  const hctx = heatCanvas.getContext("2d");

  hotspots.forEach((spot) => {
    const r = 50 * spot.intensity;
    const g = hctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, r);
    g.addColorStop(0.0, `rgba(255, 0, 0, ${spot.intensity * 0.8})`);
    g.addColorStop(0.5, `rgba(255, 255, 0, ${spot.intensity * 0.4})`);
    g.addColorStop(1.0, "rgba(255, 255, 0, 0)");
    hctx.fillStyle = g;
    hctx.beginPath();
    hctx.arc(spot.x, spot.y, r, 0, Math.PI * 2);
    hctx.fill();
  });

  // Composite
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(heatCanvas, 0, 0);

  const out = canvas.toBuffer("image/png");
  return `data:image/png;base64,${out.toString("base64")}`;
}

async function renderDataHeatmapToCanvas(
  screenshotBase64: string,
  dataPoints: Array<{ x: number; y: number; type?: "click" | "move" }>,
  viewport: { width: number; height: number }
): Promise<string> {
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");

  // Decode screenshot
  const imageData = screenshotBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const buf = Buffer.from(imageData, "base64");
  const img = await loadImage(buf);

  // Draw screenshot
  ctx.drawImage(img, 0, 0, viewport.width, viewport.height);

  // Draw heat layer
  const heatCanvas = createCanvas(viewport.width, viewport.height);
  const hctx = heatCanvas.getContext("2d");

  dataPoints.forEach((p) => {
    const x = p.x * viewport.width;
    const y = p.y * viewport.height;
    const isClick = p.type === "click";
    const intensity = isClick ? 0.8 : 0.5;
    const radius = isClick ? 30 : 20;

    const g = hctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0.0, `rgba(255, 0, 0, ${intensity})`);
    g.addColorStop(0.5, `rgba(255, 255, 0, ${intensity * 0.5})`);
    g.addColorStop(1.0, "rgba(255, 255, 0, 0)");

    hctx.fillStyle = g;
    hctx.beginPath();
    hctx.arc(x, y, radius, 0, Math.PI * 2);
    hctx.fill();
  });

  // Composite
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(heatCanvas, 0, 0);

  const out = canvas.toBuffer("image/png");
  return `data:image/png;base64,${out.toString("base64")}`;
}

/* -------------------------
 * Screenshot acquisition
 * ------------------------- */

async function getScreenshotBase64WithFallback(
  url: string,
  device: Device,
  viewport: { width: number; height: number }
): Promise<{ base64: string; viewport: { width: number; height: number } }> {
  // 1) Try robust internal screenshot (Puppeteer)
  try {
    const { png, viewport: actualVp } = await getScreenshotBuffer(url, device);
    if (png && png.length >= MIN_PNG_BYTES) {
      const vp = actualVp || viewport;
      return {
        base64: `data:image/png;base64,${png.toString("base64")}`,
        viewport: vp,
      };
    }
    throw new Error("tiny_png_from_robust_path");
  } catch (robustErr: any) {
    // 2) Fallback to external provider
    const { image } = await getExternalScreenshotBase64(url, device);
    const raw = (image || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    const buf = Buffer.from(raw, "base64");
    if (!buf || buf.length < MIN_PNG_BYTES) {
      const msg = robustErr?.message || "unknown";
      throw new Error(`SCREENSHOT_PROVIDER_FAILED (robust=${msg})`);
    }
    return { base64: image, viewport };
  }
}

/* -------------------------
 * Public API
 * ------------------------- */

/**
 * AI-driven heatmap (uses synthetic hotspots here).
 * Returns base64 PNG + meta.
 */
export async function generateHeatmap(params: HeatmapArgs): Promise<HeatmapResponse> {
  const t0 = Date.now();

  validateUrl(params.url);
  const device = sanitizeDevice(params.device);
  let viewport = VIEWPORTS[device];

  console.log(JSON.stringify({
    endpoint: "/api/v1/heatmap",
    phase: "start",
    device,
    sourceUrl: params.url,
  }));

  try {
    // Acquire screenshot (robust → external fallback)
    const shot = await getScreenshotBase64WithFallback(params.url, device, viewport);
    viewport = shot.viewport;

    // Generate AI hotspots in *pixel* coordinates using actual viewport
    const hotspots = generateAIHotspots(viewport);

    // Composite
    const base64 = await renderHeatmapToCanvas(shot.base64, hotspots, viewport);

    const durationMs = Date.now() - t0;

    console.log(JSON.stringify({
      endpoint: "/api/v1/heatmap",
      phase: "done",
      device,
      width: viewport.width,
      height: viewport.height,
      durationMs,
      sourceUrl: params.url,
    }));

    return {
      base64,
      meta: {
        phase: "phase10",
        engine: "ai",                 // ✅ correct label for AI route
        device,
        viewport,
        sourceUrl: params.url,
        durationMs,
        timestamp: new Date().toISOString(),
        reqId: params.reqId,
      },
    };
  } catch (error: any) {
    const errorMsg = error?.message?.includes("HTTP")
      ? `SCREENSHOT_PROVIDER_FAILED: ${error.message}`
      : error?.message || "Unknown error";

    console.log(JSON.stringify({
      endpoint: "/api/v1/heatmap",
      phase: "error",
      device,
      sourceUrl: params.url,
      error: errorMsg,
    }));

    throw new Error(errorMsg);
  }
}

/**
 * Data-driven heatmap (client-sent normalized points).
 * Returns base64 PNG + meta.
 */
export async function generateDataHeatmap(params: DataHeatmapArgs): Promise<HeatmapResponse> {
  const t0 = Date.now();

  validateUrl(params.url);
  const device = sanitizeDevice(params.device);
  let viewport = VIEWPORTS[device];
  const dataPoints = sanitizeDataPoints(params.dataPoints);

  console.log(JSON.stringify({
    endpoint: "/api/v1/heatmap/data",
    phase: "start",
    device,
    sourceUrl: params.url,
    pointCount: dataPoints.length,
  }));

  try {
    // Acquire screenshot (robust → external fallback)
    const shot = await getScreenshotBase64WithFallback(params.url, device, viewport);
    viewport = shot.viewport;

    // Composite
    const base64 = await renderDataHeatmapToCanvas(shot.base64, dataPoints, viewport);

    const durationMs = Date.now() - t0;

    console.log(JSON.stringify({
      endpoint: "/api/v1/heatmap/data",
      phase: "done",
      device,
      width: viewport.width,
      height: viewport.height,
      durationMs,
      sourceUrl: params.url,
      pointCount: dataPoints.length,
    }));

    return {
      base64,
      meta: {
        phase: "phase10",
        engine: "data",
        device,
        viewport,
        sourceUrl: params.url,
        durationMs,
        timestamp: new Date().toISOString(),
        reqId: params.reqId,
      },
    };
  } catch (error: any) {
    const errorMsg = error?.message?.includes("HTTP")
      ? `SCREENSHOT_PROVIDER_FAILED: ${error.message}`
      : error?.message || "Unknown error";

    console.log(JSON.stringify({
      endpoint: "/api/v1/heatmap/data",
      phase: "error",
      device,
      sourceUrl: params.url,
      error: errorMsg,
    }));

    throw new Error(errorMsg);
  }
}
