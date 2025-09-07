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
    x = 100,
    y = 100,
    w = 300,
    h = 180,
    alpha = 0.35
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

  // 2) Draw ONE obvious overlay (bright, visible)
  //    For the smoke test, prefer one mechanism for alpha: globalAlpha.
  ctx.save();
  ctx.globalAlpha = alpha;                    // e.g. 0.35
  ctx.fillStyle = "#FF0000";                  // solid red, alpha comes from globalAlpha
  ctx.fillRect(x, y, w, h);                   // rectangle at provided position
  ctx.restore();

  // Optional white border to make it pop
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
