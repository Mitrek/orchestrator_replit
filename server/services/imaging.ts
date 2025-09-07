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
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";

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
  buffer: Buffer;
}

interface WriteResult {
  filename: string;
  path: string;
  urlPath: string;
}

export async function overlayRectangleOnBase64Png(
  inputBase64: string,
  opts: OverlayOptions = {}
): Promise<OverlayResult> {
  const {
    x = 100,
    y = 100,
    w = 300,
    h = 180,
    alpha = 0.35
  } = opts;

  try {
    // Decode base64 to buffer
    const base64Data = inputBase64.replace(/^data:image\/png;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Load the image
    const image = await loadImage(imageBuffer);
    
    // Create canvas with same dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Draw the original screenshot
    ctx.drawImage(image, 0, 0);

    // Set up overlay rectangle
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255, 0, 0, 0.8)"; // Red with transparency
    ctx.fillRect(x, y, w, h);

    // Add a border for visibility
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = "rgba(255, 255, 255, 1)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Reset alpha
    ctx.globalAlpha = 1.0;

    // Export to buffer and base64
    const buffer = canvas.toBuffer("image/png");
    const base64 = `data:image/png;base64,${buffer.toString("base64")}`;

    return {
      base64,
      width: image.width,
      height: image.height,
      buffer
    };
  } catch (error: any) {
    throw new Error(`Failed to overlay rectangle: ${error?.message ?? error}`);
  }
}

export async function writePngToPublicHeatmaps(buffer: Buffer): Promise<WriteResult> {
  const heatmapsDir = join(process.cwd(), "public", "heatmaps");
  
  // Ensure directory exists
  if (!existsSync(heatmapsDir)) {
    await mkdir(heatmapsDir, { recursive: true });
  }

  // Generate unique filename
  const timestamp = Date.now();
  const id = nanoid(8);
  const filename = `heatmap-${timestamp}-${id}.png`;
  const filepath = join(heatmapsDir, filename);
  const urlPath = `/heatmaps/${filename}`;

  // Write file
  await writeFile(filepath, buffer);

  return {
    filename,
    path: filepath,
    urlPath
  };
}
