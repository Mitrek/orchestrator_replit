
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapDataRequestSchema } from "../schemas/heatmap";
import { getExternalScreenshotBase64 } from "../services/screenshotExternal";

function jlog(o: any) {
  console.log(JSON.stringify(o));
}

export async function postHeatmapData(req: Request, res: Response) {
  const t0 = performance.now();
  const requestId = nanoid();
  const route = "/api/v1/heatmap/data";

  try {
    // Validate input
    const parsed = heatmapDataRequestSchema.parse(req.body);
    const { url, device = "desktop", returnMode = "base64", dataPoints } = parsed;

    jlog({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      route,
      method: "POST",
      phase: "step1",
      sourceUrl: url,
      device,
      points: dataPoints.length
    });

    // Get screenshot (no heat layer yet)
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
      const durationMs = Math.round(performance.now() - t0);
      
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "screenshot_failed",
        provider: err?.provider || "unknown",
        errorMessage: err?.message,
        durationMs
      });

      return res.status(502).json({
        error: "screenshot_failed",
        provider: err?.provider || "unknown",
        details: err?.message || String(err),
        requestId
      });
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
      image: screenshotResult.image,
      meta: {
        sourceUrl: url,
        device,
        countPoints: dataPoints.length,
        returnMode,
        phase: "phase5.step1"
      }
    });

  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);

    // Validation error
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
      errorCode: "HEATMAP_DATA_FAILED",
      errorMessage: String(err?.message ?? err),
    });
    
    return res.status(500).json({
      error: "Failed to generate data heatmap",
      code: "HEATMAP_DATA_FAILED", 
      message: err?.message ?? String(err),
      requestId
    });
  }
}
