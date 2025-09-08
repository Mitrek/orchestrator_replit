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

import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";

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

export function heatBufferToColorRgba(
  buffer: Float32Array, 
  width: number, 
  height: number, 
  opts: { 
    ramp: "classic" | "soft"; 
    clipLowPercent: number; 
    clipHighPercent: number; 
  }
): Uint8ClampedArray {
  const { ramp, clipLowPercent, clipHighPercent } = opts;

  // Find min/max for percentile clipping
  const sortedValues = Array.from(buffer).filter(v => v > 0).sort((a, b) => a - b);
  if (sortedValues.length === 0) {
    // No heat data, return transparent
    return new Uint8ClampedArray(width * height * 4);
  }

  const minIndex = Math.floor((clipLowPercent / 100) * sortedValues.length);
  const maxIndex = Math.floor((clipHighPercent / 100) * sortedValues.length);
  const minValue = sortedValues[Math.max(0, minIndex)];
  const maxValue = sortedValues[Math.min(sortedValues.length - 1, maxIndex)];

  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < buffer.length; i++) {
    const value = buffer[i];
    const pixelIndex = i * 4;

    if (value <= 0) {
      // Transparent pixel
      rgba[pixelIndex + 3] = 0;
      continue;
    }

    // Normalize to 0-1
    const normalized = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue || 1)));

    let r: number, g: number, b: number;

    if (ramp === "classic") {
      // blue→cyan→green→yellow→red
      if (normalized < 0.25) {
        const t = normalized / 0.25;
        r = 0;
        g = Math.round(t * 255);
        b = 255;
      } else if (normalized < 0.5) {
        const t = (normalized - 0.25) / 0.25;
        r = 0;
        g = 255;
        b = Math.round((1 - t) * 255);
      } else if (normalized < 0.75) {
        const t = (normalized - 0.5) / 0.25;
        r = Math.round(t * 255);
        g = 255;
        b = 0;
      } else {
        const t = (normalized - 0.75) / 0.25;
        r = 255;
        g = Math.round((1 - t) * 255);
        b = 0;
      }
    } else {
      // soft: deeper blue→teal→lime→amber→orange
      if (normalized < 0.25) {
        const t = normalized / 0.25;
        r = Math.round(t * 64);
        g = Math.round(t * 128);
        b = 200;
      } else if (normalized < 0.5) {
        const t = (normalized - 0.25) / 0.25;
        r = Math.round(64 + t * 64);
        g = Math.round(128 + t * 127);
        b = Math.round(200 - t * 100);
      } else if (normalized < 0.75) {
        const t = (normalized - 0.5) / 0.25;
        r = Math.round(128 + t * 127);
        g = 255;
        b = Math.round(100 - t * 100);
      } else {
        const t = (normalized - 0.75) / 0.25;
        r = 255;
        g = Math.round(255 - t * 100);
        b = Math.round(t * 100);
      }
    }

    rgba[pixelIndex] = r;
    rgba[pixelIndex + 1] = g;
    rgba[pixelIndex + 2] = b;
    rgba[pixelIndex + 3] = 255;
  }

  return rgba;
}

export async function compositeHeatOverScreenshot(args: {
  screenshotPngBase64: string;
  heatRgba: Uint8ClampedArray;
  width: number;
  height: number;
  alpha: number;
  blendMode: "lighter" | "source-over";
}): Promise<string> {
  const { screenshotPngBase64, heatRgba, width, height, alpha, blendMode } = args;

  // Memory guard: downscale if too large
  const totalPixels = width * height;
  let finalWidth = width;
  let finalHeight = height;
  let finalHeatRgba = heatRgba;
  let finalScreenshot = screenshotPngBase64;

  if (totalPixels > 8_000_000) {
    const scale = Math.sqrt(8_000_000 / totalPixels);
    finalWidth = Math.round(width * scale);
    finalHeight = Math.round(height * scale);

    // Downscale heat buffer
    const tempCanvas = createCanvas(width, height);
    const tempCtx = tempCanvas.getContext("2d");
    const tempImageData = new ImageData(heatRgba, width, height);
    tempCtx.putImageData(tempImageData, 0, 0);

    const scaledCanvas = createCanvas(finalWidth, finalHeight);
    const scaledCtx = scaledCanvas.getContext("2d");
    scaledCtx.drawImage(tempCanvas, 0, 0, finalWidth, finalHeight);

    const scaledImageData = scaledCtx.getImageData(0, 0, finalWidth, finalHeight);
    finalHeatRgba = scaledImageData.data;

    // Downscale screenshot
    const imgBuffer = Buffer.from(finalScreenshot.replace(/^data:image\/png;base64,/, ''), 'base64');
    const img = await loadImage(imgBuffer);
    const screenshotCanvas = createCanvas(finalWidth, finalHeight);
    const screenshotCtx = screenshotCanvas.getContext("2d");
    screenshotCtx.drawImage(img, 0, 0, finalWidth, finalHeight);
    finalScreenshot = screenshotCanvas.toDataURL("image/png");
  }

  const canvas = createCanvas(finalWidth, finalHeight);
  const ctx = canvas.getContext("2d");

  // Draw screenshot
  const imgBuffer = Buffer.from(finalScreenshot.replace(/^data:image\/png;base64,/, ''), 'base64');
  const img = await loadImage(imgBuffer);
  ctx.drawImage(img, 0, 0);

  // Set blend properties
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.globalCompositeOperation = blendMode;

  // Draw heat layer
  const heatImageData = new ImageData(finalHeatRgba, finalWidth, finalHeight);
  ctx.putImageData(heatImageData, 0, 0);

  return canvas.toDataURL("image/png");
}