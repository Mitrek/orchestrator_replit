import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapRequestSchema } from "../schemas/heatmap";
import { screenshotToBase64, ScreenshotError } from "../services/screenshot";

// tiny built-in 1x1 placeholder so UI doesn't break if all providers fail
function dummyPng(): string {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4//8/AwAI/AL+XUuV1wAAAABJRU5ErkJggg==";
  return `data:image/png;base64,${base64}`;
}

// Fetch helper (no extra deps)
async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} – ${text?.slice(0, 200)}`,
    );
  }
  return await res.arrayBuffer();
}

// Provider A: Thum.io (expects raw URL in path, not encoded)
async function thumIo(url: string, width = 1440): Promise<string> {
  const api = `https://image.thum.io/get/png/width/${width}/${url}?cb=${Date.now()}`;
  const res = await fetch(api, { headers: { "User-Agent": "HeatmapBot/1.0" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} – ${text.slice(0, 200)}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Provider B: ScreenshotMachine (free demo key "free" works for small tests but watermarked)
// Set SCREENSHOTMACHINE_KEY in env for proper usage; falls back to "free".
async function screenshotMachine(url: string, width = 1440): Promise<string> {
  const key = process.env.SCREENSHOTMACHINE_KEY || "free";
  const api = `https://api.screenshotmachine.com/?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}&dimension=${width}xfull&format=png`;
  const buf = Buffer.from(await fetchArrayBuffer(api));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

type ProviderResult =
  | { ok: true; image: string; provider: string }
  | { ok: false; provider: string; error: string };

async function tryProviders(url: string): Promise<ProviderResult> {
  // Try Thum.io first
  try {
    const image = await thumIo(url);
    return { ok: true, image, provider: "thum.io" };
  } catch (e: any) {
    // continue
  }

  // Then ScreenshotMachine
  try {
    const image = await screenshotMachine(url);
    return { ok: true, image, provider: "screenshotmachine" };
  } catch (e: any) {
    return { ok: false, provider: "all", error: String(e?.message ?? e) };
  }
}

function jlog(o: any) {
  console.log(JSON.stringify(o));
}

export async function postHeatmapScreenshot(req: Request, res: Response) {
  const t0 = performance.now();
  const requestId = nanoid();
  const route = "/api/v1/heatmap/screenshot";

  try {
    const parsed = heatmapRequestSchema.parse(req.body);

    // 1) Primary: chromium in-container
    try {
      const image = await screenshotToBase64({
        url: parsed.url,
        device: parsed.device,
        fullPage: false,
      });

      const durationMs = Math.round(performance.now() - t0);
      jlog({
        ts: new Date().toISOString(),
        level: "info",
        requestId,
        route,
        method: "POST",
        status: 200,
        durationMs,
        provider: "chromium",
      });

      return res.status(200).json({
        meta: {
          sourceUrl: parsed.url,
          device: parsed.device,
          returnMode: parsed.returnMode,
          requestId,
          durationMs,
          provider: "chromium",
        },
        image,
      });
    } catch (err: any) {
      if (!(err instanceof ScreenshotError) || err.code !== "LAUNCH_FAILED") {
        // not a launch issue -> bubble (NAVIGATION_* or SCREENSHOT_FAILED)
        throw err;
      }
      // continue to provider chain
    }

    // 2) Fallback: external providers
    const p = await tryProviders(parsed.url);
    const durationMs = Math.round(performance.now() - t0);
    if (p.ok) {
      jlog({
        ts: new Date().toISOString(),
        level: "info",
        requestId,
        route,
        method: "POST",
        status: 200,
        durationMs,
        provider: p.provider,
      });
      return res.status(200).json({
        meta: {
          sourceUrl: parsed.url,
          device: parsed.device,
          returnMode: parsed.returnMode,
          requestId,
          durationMs,
          provider: p.provider,
        },
        image: p.image,
      });
    }

    // 3) Last resort: return dummy + 502-ish context so client flow survives
    jlog({
      ts: new Date().toISOString(),
      level: "error",
      requestId,
      route,
      method: "POST",
      status: 200, // intentionally 200 to not break UI; embed failure in meta
      durationMs,
      provider: "none",
      fallbackError: p.error,
    });

    return res.status(200).json({
      meta: {
        sourceUrl: parsed.url,
        device: parsed.device,
        returnMode: parsed.returnMode,
        requestId,
        durationMs,
        provider: "none",
        note: "All providers failed; returning placeholder",
        fallbackError: p.error?.slice(0, 300),
      },
      image: dummyPng(),
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);

    // validation error
    if (err?.issues) {
      const details = err.issues.map((i: any) => ({
        path: i.path?.join(".") || "",
        message: i.message,
      }));
      jlog({
        ts: new Date().toISOString(),
        level: "warn",
        requestId,
        route,
        method: "POST",
        status: 400,
        durationMs,
        errorCode: "VALIDATION_ERROR",
        validationErrors: details,
      });
      return res.status(400).json({
        error: "Bad Request",
        code: "VALIDATION_ERROR",
        details,
        requestId,
      });
    }

    // categorized screenshot errors from primary path
    if (err instanceof ScreenshotError) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        method: "POST",
        status: 500,
        durationMs,
        errorCode: err.code,
        errorMessage: err.message,
      });
      return res.status(500).json({
        error: "Failed to generate screenshot",
        code: err.code,
        message: err.message,
        requestId,
      });
    }

    jlog({
      ts: new Date().toISOString(),
      level: "error",
      requestId,
      route,
      method: "POST",
      status: 500,
      durationMs,
      errorCode: "UNKNOWN",
      errorMessage: String(err?.message ?? err),
    });
    return res
      .status(500)
      .json({ error: "Internal Server Error", code: "UNKNOWN", requestId });
  }
}
