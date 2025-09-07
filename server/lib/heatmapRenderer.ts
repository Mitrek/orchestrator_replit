
import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D } from '@napi-rs/canvas';
import pino from "pino";

const logger = pino();

type Point = {
  x: number;
  y: number;
  confidence?: number;
  type?: string;
};

type RenderOptions = {
  overlayOpacity?: number;
  heatIntensity?: number;
  colorPalette?: Array<{ t: number; c: [number, number, number] }>;
};

export async function renderHeatmap(
  baseScreenshot: Buffer,
  points: Point[],
  viewport: { width: number; height: number },
  maxScrollPercent: number = 1.0,
  options: RenderOptions = {}
): Promise<Buffer> {
  const img = await loadImage(baseScreenshot);
  const W = img.width;
  const H = img.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Draw base image
  ctx.drawImage(img, 0, 0);

  // Calculate viewed area
  const scrollableDist = H > viewport.height ? H - viewport.height : 0;
  const viewedHeight = viewport.height + (maxScrollPercent * scrollableDist);

  // Apply dark overlay to viewed area
  ctx.globalAlpha = options.overlayOpacity || 0.85;
  ctx.fillStyle = '#0a192f';
  ctx.fillRect(0, 0, W, viewedHeight);
  ctx.globalAlpha = 1.0;

  if (!points || points.length === 0) {
    logger.info('No hotspots to render. Saving base image with overlay.');
    return canvas.toBuffer('image/png');
  }

  // Create heat layer
  const heatCanvas = createCanvas(W, H);
  const heatCtx = heatCanvas.getContext('2d');

  // Render heat points
  points.forEach(point => {
    const confidence = point.confidence || 0.5;
    const radius = Math.max(30, confidence * 75);
    
    const gradient = heatCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.15 * confidence})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    heatCtx.fillStyle = gradient;
    heatCtx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  });

  // Colorize heat data
  const heatData = heatCtx.getImageData(0, 0, W, H).data;
  const colorizedData = ctx.createImageData(W, H);
  const px = colorizedData.data;

  const palette = options.colorPalette || [
    { t: 0.0, c: [0, 0, 255] },     // Blue
    { t: 0.3, c: [0, 255, 255] },   // Cyan
    { t: 0.5, c: [0, 255, 0] },     // Green
    { t: 0.75, c: [255, 255, 0] },  // Yellow
    { t: 1.0, c: [255, 0, 0] }      // Red
  ];

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  for (let i = 0; i < heatData.length; i += 4) {
    const alpha = heatData[i + 3] / 255;
    if (alpha > 0) {
      let s = 0;
      while (s < palette.length - 1 && alpha > palette[s + 1].t) s++;
      
      const p0 = palette[s];
      const p1 = palette[s + 1] || palette[s];
      const u = (p1.t === p0.t) ? 0 : (alpha - p0.t) / (p1.t - p0.t);
      
      px[i] = Math.round(lerp(p0.c[0], p1.c[0], u));
      px[i + 1] = Math.round(lerp(p0.c[1], p1.c[1], u));
      px[i + 2] = Math.round(lerp(p0.c[2], p1.c[2], u));
      px[i + 3] = alpha * 255;
    }
  }

  heatCtx.putImageData(colorizedData, 0, 0);

  // Composite heat layer onto base image
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(heatCanvas, 0, 0);

  return canvas.toBuffer('image/png');
}

export async function renderAboveTheFoldHeatmap(
  viewportScreenshot: Buffer,
  hotspots: Point[],
  options: RenderOptions = {}
): Promise<Buffer> {
  return renderHeatmap(viewportScreenshot, hotspots, { width: 0, height: 0 }, 1.0, options);
}

export async function renderDataHeatmap(
  fullScreenshot: Buffer,
  points: Point[],
  viewport: { width: number; height: number },
  maxScrollPercent: number,
  options: RenderOptions = {}
): Promise<Buffer> {
  return renderHeatmap(fullScreenshot, points, viewport, maxScrollPercent, options);
}
