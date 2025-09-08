
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
    // Find max value without spread operator to avoid stack overflow
    let maxValue = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] > maxValue) {
        maxValue = buffer[i];
      }
    }
    return { buffer: new Float32Array(buffer), maxValue };
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
  
  // Find max value without spread operator to avoid stack overflow
  let maxValue = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] > maxValue) {
      maxValue = result[i];
    }
  }
  
  return { buffer: result, maxValue };
}

/**
 * Downsample heat buffer using average pooling
 */
function downsampleHeatBuffer(
  buffer: Float32Array,
  width: number,
  height: number,
  newWidth: number,
  newHeight: number
): Float32Array {
  const result = new Float32Array(newWidth * newHeight);
  const scaleX = width / newWidth;
  const scaleY = height / newHeight;
  
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      let sum = 0;
      let count = 0;
      
      // Sample from the original buffer using average pooling
      const startX = Math.floor(x * scaleX);
      const endX = Math.min(width, Math.ceil((x + 1) * scaleX));
      const startY = Math.floor(y * scaleY);
      const endY = Math.min(height, Math.ceil((y + 1) * scaleY));
      
      for (let sy = startY; sy < endY; sy++) {
        for (let sx = startX; sx < endX; sx++) {
          sum += buffer[sy * width + sx];
          count++;
        }
      }
      
      result[y * newWidth + x] = count > 0 ? sum / count : 0;
    }
  }
  
  return result;
}

/**
 * Color ramp functions
 */
function applyClassicRamp(normalized: number): [number, number, number] {
  // Blue → Cyan → Green → Yellow → Red
  if (normalized <= 0.25) {
    const t = normalized / 0.25;
    return [0, Math.round(t * 255), 255]; // Blue to Cyan
  } else if (normalized <= 0.5) {
    const t = (normalized - 0.25) / 0.25;
    return [0, 255, Math.round((1 - t) * 255)]; // Cyan to Green
  } else if (normalized <= 0.75) {
    const t = (normalized - 0.5) / 0.25;
    return [Math.round(t * 255), 255, 0]; // Green to Yellow
  } else {
    const t = (normalized - 0.75) / 0.25;
    return [255, Math.round((1 - t) * 255), 0]; // Yellow to Red
  }
}

function applySoftRamp(normalized: number): [number, number, number] {
  // Deep blue → Teal → Lime → Amber → Orange (lower saturation)
  if (normalized <= 0.25) {
    const t = normalized / 0.25;
    return [0, Math.round(t * 128), 192]; // Deep blue to Teal
  } else if (normalized <= 0.5) {
    const t = (normalized - 0.25) / 0.25;
    return [0, Math.round(128 + t * 127), Math.round(192 - t * 64)]; // Teal to Lime
  } else if (normalized <= 0.75) {
    const t = (normalized - 0.5) / 0.25;
    return [Math.round(t * 255), 255, Math.round(128 - t * 128)]; // Lime to Amber
  } else {
    const t = (normalized - 0.75) / 0.25;
    return [255, Math.round(255 - t * 100), 0]; // Amber to Orange
  }
}

/**
 * Convert heat buffer to colored RGBA data
 */
export function heatBufferToColorRgba(
  buffer: Float32Array,
  width: number,
  height: number,
  options: {
    ramp?: "classic" | "soft";
    clipLowPercent?: number;
    clipHighPercent?: number;
  } = {}
): Uint8ClampedArray {
  const { ramp = "classic", clipLowPercent = 0, clipHighPercent = 100 } = options;
  
  // Find min/max values
  let minValue = Infinity;
  let maxValue = -Infinity;
  
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > 0) {
      minValue = Math.min(minValue, buffer[i]);
      maxValue = Math.max(maxValue, buffer[i]);
    }
  }
  
  if (minValue === Infinity) {
    // No heat data, return transparent
    return new Uint8ClampedArray(width * height * 4);
  }
  
  // Calculate percentile clipping values
  const range = maxValue - minValue;
  const lowClip = minValue + (range * clipLowPercent / 100);
  const highClip = minValue + (range * clipHighPercent / 100);
  const clipRange = highClip - lowClip;
  
  const rgbaData = new Uint8ClampedArray(width * height * 4);
  const rampFunction = ramp === "classic" ? applyClassicRamp : applySoftRamp;
  
  for (let i = 0; i < buffer.length; i++) {
    const value = buffer[i];
    const pixelIndex = i * 4;
    
    if (value <= 0) {
      // Transparent pixel
      rgbaData[pixelIndex] = 0;     // R
      rgbaData[pixelIndex + 1] = 0; // G
      rgbaData[pixelIndex + 2] = 0; // B
      rgbaData[pixelIndex + 3] = 0; // A
    } else {
      // Clip and normalize
      const clippedValue = Math.max(lowClip, Math.min(highClip, value));
      const normalized = clipRange > 0 ? (clippedValue - lowClip) / clipRange : 0;
      
      const [r, g, b] = rampFunction(normalized);
      
      rgbaData[pixelIndex] = r;     // R
      rgbaData[pixelIndex + 1] = g; // G
      rgbaData[pixelIndex + 2] = b; // B
      rgbaData[pixelIndex + 3] = 255; // A (full alpha where heat exists)
    }
  }
  
  return rgbaData;
}

/**
 * Composite heat layer over screenshot
 */
export function compositeHeatOverScreenshot(options: {
  screenshotPngBase64: string;
  heatRgba: Uint8ClampedArray;
  width: number;
  height: number;
  alpha: number;
  blendMode: "lighter" | "source-over";
}): string {
  const { screenshotPngBase64, heatRgba, width, height, alpha, blendMode } = options;
  
  const MAX_COMPOSITE_PIXELS = 8_000_000; // 8MP limit for compositing
  const pixels = width * height;
  
  let workingWidth = width;
  let workingHeight = height;
  let workingHeatRgba = heatRgba;
  
  // Downscale if too large to prevent memory issues
  if (pixels > MAX_COMPOSITE_PIXELS) {
    const scale = Math.sqrt(MAX_COMPOSITE_PIXELS / pixels);
    workingWidth = Math.max(1, Math.floor(width * scale));
    workingHeight = Math.max(1, Math.floor(height * scale));
    
    // Downsample the heat RGBA data
    workingHeatRgba = new Uint8ClampedArray(workingWidth * workingHeight * 4);
    const scaleX = width / workingWidth;
    const scaleY = height / workingHeight;
    
    for (let y = 0; y < workingHeight; y++) {
      for (let x = 0; x < workingWidth; x++) {
        // Sample from original using nearest neighbor
        const srcX = Math.min(width - 1, Math.floor(x * scaleX));
        const srcY = Math.min(height - 1, Math.floor(y * scaleY));
        const srcIndex = (srcY * width + srcX) * 4;
        const dstIndex = (y * workingWidth + x) * 4;
        
        workingHeatRgba[dstIndex] = heatRgba[srcIndex];
        workingHeatRgba[dstIndex + 1] = heatRgba[srcIndex + 1];
        workingHeatRgba[dstIndex + 2] = heatRgba[srcIndex + 2];
        workingHeatRgba[dstIndex + 3] = heatRgba[srcIndex + 3];
      }
    }
  }
  
  try {
    // Load the screenshot
    const cleaned = screenshotPngBase64
      .replace(/^data:image\/png;base64,/, "")
      .replace(/^data:image\/jpeg;base64,/, "")
      .trim();
    
    const imageBuffer = Buffer.from(cleaned, "base64");
    
    // Create canvas and load screenshot
    const canvas = createCanvas(workingWidth, workingHeight);
    const ctx = canvas.getContext("2d");
    
    // If we downscaled, we need to resize the screenshot too
    if (workingWidth !== width || workingHeight !== height) {
      const tempCanvas = createCanvas(width, height);
      const tempCtx = tempCanvas.getContext("2d");
      const image = await loadImage(imageBuffer);
      tempCtx.drawImage(image, 0, 0);
      
      // Draw downscaled screenshot
      ctx.drawImage(tempCanvas, 0, 0, workingWidth, workingHeight);
    } else {
      const image = await loadImage(imageBuffer);
      ctx.drawImage(image, 0, 0);
    }
    
    // Create heat layer
    const heatImageData = ctx.createImageData(workingWidth, workingHeight);
    heatImageData.data.set(workingHeatRgba);
    
    // Apply heat layer with alpha and blend mode
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = blendMode;
    ctx.putImageData(heatImageData, 0, 0);
    ctx.restore();
    
    // Export to PNG base64
    const buffer = canvas.toBuffer("image/png");
    return `data:image/png;base64,${buffer.toString("base64")}`;
    
  } catch (error: any) {
    throw new Error(`Failed to composite heat over screenshot: ${error?.message ?? error}`);
  }
}

/**
 * Convert heat buffer to grayscale PNG base64 with safe downscaling
 */
export function heatBufferToGreyscalePngBase64(
  buffer: Float32Array,
  width: number,
  height: number
): string {
  const MAX_DEBUG_MEGA_PIXELS = 3_000_000;
  const pixels = width * height;
  
  let finalBuffer = buffer;
  let finalWidth = width;
  let finalHeight = height;
  
  // Downscale if too large to prevent memory issues
  if (pixels > MAX_DEBUG_MEGA_PIXELS) {
    const scale = Math.sqrt(MAX_DEBUG_MEGA_PIXELS / pixels);
    finalWidth = Math.max(1, Math.floor(width * scale));
    finalHeight = Math.max(1, Math.floor(height * scale));
    finalBuffer = downsampleHeatBuffer(buffer, width, height, finalWidth, finalHeight);
  }
  
  const canvas = createCanvas(finalWidth, finalHeight);
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(finalWidth, finalHeight);
  
  // Find max value for normalization (avoid stack overflow)
  let maxValue = 0;
  for (let i = 0; i < finalBuffer.length; i++) {
    if (finalBuffer[i] > maxValue) {
      maxValue = finalBuffer[i];
    }
  }
  
  // Convert to grayscale pixels
  for (let i = 0; i < finalBuffer.length; i++) {
    const value = finalBuffer[i];
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
