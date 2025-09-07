import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapRequestSchema } from "../schemas/heatmap";
import { overlayRectangleOnBase64Png } from "../services/imaging";
import { getExternalScreenshotBase64 } from "../services/screenshotExternal";

function jlog(o: any) {
  console.log(JSON.stringify(o));
}

export async function postHeatmap(req: Request, res: Response) {
  const t0 = performance.now();
  const requestId = nanoid();
  const route = "/api/v1/heatmap/overlay";

  try {
    // Validate input
    const parsed = heatmapRequestSchema.parse(req.body);
    const { url, device = "desktop" } = parsed;

    jlog({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      route,
      method: "POST",
      phase: "start",
      sourceUrl: url,
      device
    });

    // Step 1: Get screenshot from external provider (no Puppeteer/Chromium)
    let screenshotResult;
    try {
      screenshotResult = await getExternalScreenshotBase64(url, device);

      jlog({
        ts: new Date().toISOString(),
        level: "info",
        requestId,
        route,
        phase: "screenshot_ok",
        provider: screenshotResult.provider
      });
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "screenshot_failed",
        errorMessage: err?.message
      });
      throw err;
    }

    // Step 2: Overlay rectangle
    let overlayResult;
    try {
      overlayResult = await overlayRectangleOnBase64Png(screenshotResult.image, {
        x: 50,
        y: 50,
        w: 600,
        h: 400,
        alpha: 0.5
      });

      jlog({
        ts: new Date().toISOString(),
        level: "info",
        requestId,
        route,
        phase: "overlay_ok"
      });
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "overlay_failed",
        errorMessage: err?.message
      });
      throw err;
    }

    const durationMs = Math.round(performance.now() - t0);

    jlog({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      route,
      method: "POST",
      status: 200,
      durationMs,
      provider: screenshotResult.provider
    });

    return res.status(200).json({
      image: overlayResult.base64,
      meta: {
        sourceUrl: url,
        device,
        returnMode: "base64",
        requestId,
        durationMs,
        provider: screenshotResult.provider
      }
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

    jlog({
      ts: new Date().toISOString(),
      level: "error",
      requestId,
      route,
      method: "POST",
      status: 500,
      durationMs,
      errorCode: "OVERLAY_FAILED",
      errorMessage: String(err?.message ?? err),
    });
    return res.status(500).json({
      error: "Failed to generate overlay",
      code: "OVERLAY_FAILED", 
      message: err?.message ?? String(err),
      requestId
    });
  }
}

export async function getHeatmap(_req: Request, res: Response) {
  return res.status(200).json({
    message: "Heatmap API is operational",
    version: "1.0.0",
    endpoints: {
      POST: "/api/v1/heatmap - Generate heatmap with overlay (base64 only)"
    }
  });
}