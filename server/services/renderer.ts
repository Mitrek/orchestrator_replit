
import { createCanvas, loadImage, CanvasRenderingContext2D } from "@napi-rs/canvas";

export type RenderKnobs = {
  alpha: number;
  ramp: "classic" | "soft";
  blendMode: "lighter";
  clipMin?: number;
  clipMax?: number;
  kernelRadiusPx?: number;
  kernelSigmaPx?: number;
};

const DEFAULT_KNOBS: RenderKnobs = {
  alpha: 0.6,
  ramp: "classic",
  blendMode: "lighter",
  clipMin: 0.1,
  clipMax: 1.0,
  kernelRadiusPx: 40,
  kernelSigmaPx: 20,
};

export async function renderFromPoints(opts: {
  screenshotPng: Buffer;
  viewport: { width: number; height: number };
  points: Array<{ x: number; y: number; weight?: number }>;
  knobs?: Partial<RenderKnobs>;
}): Promise<Buffer> {
  const { screenshotPng, viewport, points, knobs = {} } = opts;
  const finalKnobs = { ...DEFAULT_KNOBS, ...knobs };

  // Create canvas with viewport dimensions
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");

  // Load and draw screenshot
  const screenshot = await loadImage(screenshotPng);
  ctx.drawImage(screenshot, 0, 0, viewport.width, viewport.height);

  if (points.length === 0) {
    return canvas.toBuffer("image/png");
  }

  // Create heatmap overlay
  const heatmapCanvas = createCanvas(viewport.width, viewport.height);
  const heatCtx = heatmapCanvas.getContext("2d");

  // Generate heat gradient
  const gradient = createHeatGradient(heatCtx, finalKnobs.ramp);

  // Draw heat points
  points.forEach(point => {
    const weight = point.weight || 1.0;
    const intensity = Math.max(finalKnobs.clipMin || 0, Math.min(finalKnobs.clipMax || 1, weight));
    
    drawHeatPoint(heatCtx, point.x, point.y, intensity, finalKnobs.kernelRadiusPx || 40);
  });

  // Apply gradient mapping
  applyGradientMap(heatCtx, gradient, viewport.width, viewport.height);

  // Composite with screenshot
  ctx.globalAlpha = finalKnobs.alpha;
  ctx.globalCompositeOperation = finalKnobs.blendMode;
  ctx.drawImage(heatmapCanvas, 0, 0);

  return canvas.toBuffer("image/png");
}

function createHeatGradient(ctx: CanvasRenderingContext2D, ramp: "classic" | "soft"): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  
  if (ramp === "classic") {
    gradient.addColorStop(0, "rgba(0,0,255,0)");     // transparent blue
    gradient.addColorStop(0.25, "rgba(0,0,255,0.5)"); // blue
    gradient.addColorStop(0.5, "rgba(0,255,0,0.7)");  // green  
    gradient.addColorStop(0.75, "rgba(255,255,0,0.8)"); // yellow
    gradient.addColorStop(1, "rgba(255,0,0,1)");      // red
  } else {
    gradient.addColorStop(0, "rgba(255,255,255,0)");   // transparent
    gradient.addColorStop(0.5, "rgba(255,165,0,0.5)"); // orange
    gradient.addColorStop(1, "rgba(255,69,0,0.8)");    // red-orange
  }
  
  return gradient;
}

function drawHeatPoint(ctx: CanvasRenderingContext2D, x: number, y: number, intensity: number, radius: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255,255,255,${intensity})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function applyGradientMap(ctx: CanvasRenderingContext2D, gradient: CanvasGradient, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Create gradient lookup canvas
  const lookupCanvas = createCanvas(256, 1);
  const lookupCtx = lookupCanvas.getContext("2d");
  lookupCtx.fillStyle = gradient;
  lookupCtx.fillRect(0, 0, 256, 1);
  const lookupData = lookupCtx.getImageData(0, 0, 256, 1).data;
  
  // Apply gradient mapping
  for (let i = 0; i < data.length; i += 4) {
    const intensity = data[i]; // Use red channel as intensity
    const lookupIndex = Math.floor((intensity / 255) * 255) * 4;
    
    data[i] = lookupData[lookupIndex];     // R
    data[i + 1] = lookupData[lookupIndex + 1]; // G
    data[i + 2] = lookupData[lookupIndex + 2]; // B
    data[i + 3] = lookupData[lookupIndex + 3]; // A
  }
  
  ctx.putImageData(imageData, 0, 0);
}
