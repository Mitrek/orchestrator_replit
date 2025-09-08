
// FILE: server/services/imaging.ts

/**
 * Returns a 1×1 transparent PNG as a base64 data URL.
 * Useful for smoke tests before we wire up Puppeteer/Canvas.
 */
export function makeDummyPngBase64(): string {
  // This is a valid 1x1 transparent PNG, base64-encoded
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4//8/AwAI/AL+XUuV1wAAAABJRU5ErkJggg==";

  return `data:image/png;base64,${base64}`;
}

import { createCanvas, loadImage } from "@napi-rs/canvas";

interface OverlayOptions {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  alpha?: number;
}

interface OverlayResult {
  base64: string;
  width: number;
  height: number;
}

export async function overlayRectangleOnBase64Png(
  inputBase64: string,
  opts: OverlayOptions = {}
): Promise<OverlayResult> {
  const {
    x = 50,
    y = 50,
    w = 600,
    h = 400,
    alpha = 0.5
  } = opts;

  try {
    // Accept PNG or JPEG data URIs, or raw base64
    const cleaned = inputBase64
      .replace(/^data:image\/png;base64,/, "")
      .replace(/^data:image\/jpeg;base64,/, "")
      .trim();

    if (!cleaned) {
      throw new Error("Empty base64 image input");
    }

    const imageBuffer = Buffer.from(cleaned, "base64");

    // Load the screenshot as an Image
    const image = await loadImage(imageBuffer);

    // Create canvas same dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // 1) Draw the screenshot FIRST
    ctx.drawImage(image, 0, 0);

    // 2) Draw one visible rectangle for Phase 4
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#FF0000";
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // Optional white border to guarantee visibility
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // Export to base64 PNG
    const buffer = canvas.toBuffer("image/png");
    const base64 = `data:image/png;base64,${buffer.toString("base64")}`;

    return { base64, width: image.width, height: image.height };
  } catch (error: any) {
    throw new Error(`Failed to overlay rectangle: ${error?.message ?? error}`);
  }
}

// ============= Heat Buffer Functions =============

interface PixelPoint {
  xPx: number;
  yPx: number;
}

interface HeatAccumulationOptions {
  radiusPx?: number;
  intensityPerPoint?: number;
  cap?: number | null;
}

interface HeatAccumulationResult {
  buffer: Float32Array;
  width: number;
  height: number;
  maxValue: number;
  nonZeroCount: number;
}

interface BlurOptions {
  blurPx?: number;
}

interface BlurResult {
  buffer: Float32Array;
  maxValue: number;
}

/**
 * Extract image dimensions from base64 PNG/JPEG data
 */
export async function getImageDimensions(base64Data: string): Promise<{ width: number; height: number }> {
  try {
    const cleaned = base64Data
      .replace(/^data:image\/png;base64,/, "")
      .replace(/^data:image\/jpeg;base64,/, "")
      .trim();

    const imageBuffer = Buffer.from(cleaned, "base64");
    const image = await loadImage(imageBuffer);
    
    return { width: image.width, height: image.height };
  } catch (error: any) {
    throw new Error(`Failed to get image dimensions: ${error?.message ?? error}`);
  }
}

/**
 * Map normalized points (0..1) to pixel coordinates
 */
export function mapNormalizedPointsToPixels(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number
): PixelPoint[] {
  return points.map(point => ({
    xPx: Math.round(point.x * (width - 1)),
    yPx: Math.round(point.y * (height - 1))
  }));
}

/**
 * Accumulate heat intensity in a buffer using circular kernels
 */
export function accumulateHeat(
  width: number,
  height: number,
  pixelPoints: PixelPoint[],
  options: HeatAccumulationOptions = {}
): HeatAccumulationResult {
  const { radiusPx = 40, intensityPerPoint = 1.0, cap = null } = options;
  
  const buffer = new Float32Array(width * height);
  
  for (const point of pixelPoints) {
    const { xPx, yPx } = point;
    
    // Add intensity in a circular pattern around each point
    for (let dy = -radiusPx; dy <= radiusPx; dy++) {
      for (let dx = -radiusPx; dx <= radiusPx; dx++) {
        const x = xPx + dx;
        const y = yPx + dy;
        
        // Check bounds
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        // Calculate distance from center
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radiusPx) continue;
        
        // Linear falloff (could be Gaussian for smoother results)
        const falloff = Math.max(0, 1 - distance / radiusPx);
        const intensity = intensityPerPoint * falloff;
        
        const index = y * width + x;
        buffer[index] += intensity;
        
        // Apply cap if specified
        if (cap !== null && buffer[index] > cap) {
          buffer[index] = cap;
        }
      }
    }
  }
  
  // Calculate statistics
  let maxValue = 0;
  let nonZeroCount = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > 0) {
      nonZeroCount++;
      maxValue = Math.max(maxValue, buffer[i]);
    }
  }
  
  return {
    buffer,
    width,
    height,
    maxValue,
    nonZeroCount
  };
}

/**
 * Apply box blur to heat buffer
 */
export function blurHeatBuffer(
  buffer: Float32Array,
  width: number,
  height: number,
  options: BlurOptions = {}
): BlurResult {
  const { blurPx = 24 } = options;
  
  if (blurPx <= 0) {
    return { buffer: new Float32Array(buffer), maxValue: Math.max(...buffer) };
  }
  
  // Simple box blur implementation
  const temp = new Float32Array(width * height);
  const result = new Float32Array(width * height);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      for (let i = -blurPx; i <= blurPx; i++) {
        const sx = x + i;
        if (sx >= 0 && sx < width) {
          sum += buffer[y * width + sx];
          count++;
        }
      }
      
      temp[y * width + x] = sum / count;
    }
  }
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      for (let i = -blurPx; i <= blurPx; i++) {
        const sy = y + i;
        if (sy >= 0 && sy < height) {
          sum += temp[sy * width + x];
          count++;
        }
      }
      
      result[y * width + x] = sum / count;
    }
  }
  
  const maxValue = Math.max(...result);
  
  return { buffer: result, maxValue };
}

/**
 * Convert heat buffer to grayscale PNG base64
 */
export function heatBufferToGreyscalePngBase64(
  buffer: Float32Array,
  width: number,
  height: number
): string {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  
  // Find max value for normalization
  const maxValue = Math.max(...buffer);
  
  // Convert to grayscale pixels
  for (let i = 0; i < buffer.length; i++) {
    const value = buffer[i];
    const normalized = maxValue > 0 ? value / maxValue : 0;
    const gray = Math.round(normalized * 255);
    
    const pixelIndex = i * 4;
    imageData.data[pixelIndex] = gray;     // R
    imageData.data[pixelIndex + 1] = gray; // G
    imageData.data[pixelIndex + 2] = gray; // B
    imageData.data[pixelIndex + 3] = value > 0 ? 255 : 0; // A (full alpha where heat exists)
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const pngBuffer = canvas.toBuffer("image/png");
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}
