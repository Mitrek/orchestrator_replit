
import { createCanvas, Image } from "@napi-rs/canvas";
import { getExternalScreenshotBase64 } from "./screenshotExternal";

type Device = "desktop" | "tablet" | "mobile";

interface HeatmapArgs {
  url: string;
  device?: Device;
}

interface DataHeatmapArgs extends HeatmapArgs {
  dataPoints: Array<{
    x: number;
    y: number;
    type?: "click" | "move";
  }>;
}

interface HeatmapResponse {
  base64: string;
  meta: {
    sourceUrl: string;
    device: Device;
    viewport: { width: number; height: number };
    engine: "ai" | "data";
    durationMs: number;
    timestamp: string;
    phase: "phase6";
  };
}

// Device viewport mappings
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 414, height: 896 },
} as const;

function validateUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required');
  }
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }
}

function sanitizeDevice(device?: Device): Device {
  if (!device || !['desktop', 'tablet', 'mobile'].includes(device)) {
    return 'desktop';
  }
  return device;
}

function sanitizeDataPoints(dataPoints: any[]): Array<{ x: number; y: number; type?: string }> {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
    throw new Error('dataPoints[] required');
  }
  
  return dataPoints.map(point => ({
    x: Math.max(0, Math.min(1, Number(point.x) || 0)),
    y: Math.max(0, Math.min(1, Number(point.y) || 0)),
    type: point.type || 'move'
  }));
}

function generateAIHotspots(viewport: { width: number; height: number }): Array<{ x: number; y: number; intensity: number }> {
  // AI-simulated hotspots - deterministic for consistency
  return [
    { x: viewport.width * 0.5, y: viewport.height * 0.2, intensity: 0.8 },
    { x: viewport.width * 0.3, y: viewport.height * 0.4, intensity: 0.6 },
    { x: viewport.width * 0.7, y: viewport.height * 0.6, intensity: 0.7 },
    { x: viewport.width * 0.5, y: viewport.height * 0.8, intensity: 0.5 },
  ];
}

function renderHeatmapToCanvas(
  screenshotBase64: string,
  hotspots: Array<{ x: number; y: number; intensity: number }>,
  viewport: { width: number; height: number }
): string {
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  // Create screenshot image from base64
  const img = new Image();
  const imageData = screenshotBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const buffer = Buffer.from(imageData, 'base64');
  img.src = buffer;

  // Draw screenshot
  ctx.drawImage(img, 0, 0, viewport.width, viewport.height);

  // Create heatmap overlay
  const heatmapCanvas = createCanvas(viewport.width, viewport.height);
  const heatmapCtx = heatmapCanvas.getContext('2d');

  // Draw hotspots
  hotspots.forEach(spot => {
    const gradient = heatmapCtx.createRadialGradient(
      spot.x, spot.y, 0,
      spot.x, spot.y, 50 * spot.intensity
    );
    
    gradient.addColorStop(0, `rgba(255, 0, 0, ${spot.intensity * 0.8})`);
    gradient.addColorStop(0.5, `rgba(255, 255, 0, ${spot.intensity * 0.4})`);
    gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');

    heatmapCtx.fillStyle = gradient;
    heatmapCtx.beginPath();
    heatmapCtx.arc(spot.x, spot.y, 50 * spot.intensity, 0, 2 * Math.PI);
    heatmapCtx.fill();
  });

  // Composite heatmap on screenshot with blend mode
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(heatmapCanvas, 0, 0);

  // Return base64 encoded PNG
  const buffer64 = canvas.toBuffer('image/png');
  return `data:image/png;base64,${buffer64.toString('base64')}`;
}

function renderDataHeatmapToCanvas(
  screenshotBase64: string,
  dataPoints: Array<{ x: number; y: number; type?: string }>,
  viewport: { width: number; height: number }
): string {
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  // Create screenshot image from base64
  const img = new Image();
  const imageData = screenshotBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const buffer = Buffer.from(imageData, 'base64');
  img.src = buffer;

  // Draw screenshot
  ctx.drawImage(img, 0, 0, viewport.width, viewport.height);

  // Create heatmap overlay
  const heatmapCanvas = createCanvas(viewport.width, viewport.height);
  const heatmapCtx = heatmapCanvas.getContext('2d');

  // Convert normalized coordinates to pixel coordinates and render
  dataPoints.forEach(point => {
    const x = point.x * viewport.width;
    const y = point.y * viewport.height;
    const intensity = point.type === 'click' ? 0.8 : 0.5;
    const radius = point.type === 'click' ? 30 : 20;

    const gradient = heatmapCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 0, 0, ${intensity})`);
    gradient.addColorStop(0.5, `rgba(255, 255, 0, ${intensity * 0.5})`);
    gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');

    heatmapCtx.fillStyle = gradient;
    heatmapCtx.beginPath();
    heatmapCtx.arc(x, y, radius, 0, 2 * Math.PI);
    heatmapCtx.fill();
  });

  // Composite heatmap on screenshot
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(heatmapCanvas, 0, 0);

  // Return base64 encoded PNG
  const buffer64 = canvas.toBuffer('image/png');
  return `data:image/png;base64,${buffer64.toString('base64')}`;
}

export async function generateHeatmap(params: HeatmapArgs): Promise<HeatmapResponse> {
  const t0 = Date.now();
  
  validateUrl(params.url);
  const device = sanitizeDevice(params.device);
  const viewport = VIEWPORTS[device];

  try {
    console.log(JSON.stringify({
      endpoint: '/api/v1/heatmap',
      phase: 'start',
      device,
      sourceUrl: params.url
    }));

    // Get screenshot using provider-only method
    const { image: screenshotBase64 } = await getExternalScreenshotBase64(params.url, device);

    // Generate AI hotspots
    const hotspots = generateAIHotspots(viewport);

    // Render heatmap
    const base64 = renderHeatmapToCanvas(screenshotBase64, hotspots, viewport);

    const durationMs = Date.now() - t0;

    console.log(JSON.stringify({
      endpoint: '/api/v1/heatmap',
      device,
      durationMs,
      width: viewport.width,
      height: viewport.height,
      sourceUrl: params.url
    }));

    return {
      base64,
      meta: {
        phase: 'phase7',
        engine: 'data',
        sourceUrl: params.url,
        device,
        viewport,
        durationMs,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error: any) {
    const errorMsg = error?.message?.includes('HTTP') ? 
      `SCREENSHOT_PROVIDER_FAILED: ${error.message}` : 
      error?.message || 'Unknown error';
      
    console.log(JSON.stringify({
      endpoint: '/api/v1/heatmap',
      error: errorMsg,
      sourceUrl: params.url
    }));
    throw new Error(errorMsg);
  }
}

export async function generateDataHeatmap(params: DataHeatmapArgs): Promise<HeatmapResponse> {
  const t0 = Date.now();
  
  validateUrl(params.url);
  const device = sanitizeDevice(params.device);
  const viewport = VIEWPORTS[device];
  const dataPoints = sanitizeDataPoints(params.dataPoints);

  try {
    console.log(JSON.stringify({
      endpoint: '/api/v1/heatmap/data',
      phase: 'start',
      device,
      sourceUrl: params.url,
      pointCount: dataPoints.length
    }));

    // Get screenshot using provider-only method
    const { image: screenshotBase64 } = await getExternalScreenshotBase64(params.url, device);

    // Render data heatmap
    const base64 = renderDataHeatmapToCanvas(screenshotBase64, dataPoints, viewport);

    const durationMs = Date.now() - t0;

    console.log(JSON.stringify({
      endpoint: '/api/v1/heatmap/data',
      device,
      durationMs,
      width: viewport.width,
      height: viewport.height,
      sourceUrl: params.url,
      pointCount: dataPoints.length
    }));

    return {
      base64,
      meta: {
        phase: 'phase7',
        engine: 'data',
        sourceUrl: params.url,
        device,
        viewport,
        durationMs,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error: any) {
    const errorMsg = error?.message?.includes('HTTP') ? 
      `SCREENSHOT_PROVIDER_FAILED: ${error.message}` : 
      error?.message || 'Unknown error';
      
    console.log(JSON.stringify({
      endpoint: '/api/v1/heatmap/data',
      error: errorMsg,
      sourceUrl: params.url
    }));
    throw new Error(errorMsg);
  }
}
