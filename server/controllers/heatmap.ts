
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapRequestSchema } from "../schemas/heatmap";
import { screenshotToBase64, ScreenshotError } from "../services/screenshot";
import { overlayRectangleOnBase64Png, writePngToPublicHeatmaps } from "../services/imaging";

function jlog(o: any) {
  console.log(JSON.stringify(o));
}

export async function postHeatmap(req: Request, res: Response) {
  const t0 = performance.now();
  const requestId = nanoid();
  const route = "/api/v1/heatmap";

  try {
    // Validate input
    const parsed = heatmapRequestSchema.parse(req.body);
    const { url, device = "desktop", returnMode = "base64" } = parsed;

    jlog({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      route,
      method: "POST",
      phase: "start",
      sourceUrl: url,
      device,
      returnMode
    });

    // Step 1: Take screenshot
    let screenshotBase64: string;
    try {
      screenshotBase64 = await screenshotToBase64({
        url,
        device,
        fullPage: false
      });
      
      jlog({
        ts: new Date().toISOString(),
        level: "info",
        requestId,
        route,
        phase: "screenshot_ok"
      });
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "screenshot_failed",
        errorCode: err instanceof ScreenshotError ? err.code : "UNKNOWN",
        errorMessage: err?.message
      });
      throw err;
    }

    // Step 2: Overlay rectangle
    let overlayResult;
    try {
      overlayResult = await overlayRectangleOnBase64Png(screenshotBase64, {
        x: 100,
        y: 100,
        w: 300,
        h: 180,
        alpha: 0.35
      });

      jlog({
        ts: new Date().toISOString(),
        level: "info",
        requestId,
        route,
        phase: "overlay_ok",
        dimensions: `${overlayResult.width}x${overlayResult.height}`
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
      
      const durationMs = Math.round(performance.now() - t0);
      return res.status(500).json({
        error: "Failed to render overlay",
        code: "RENDER_FAILED",
        message: err?.message,
        requestId
      });
    }

    const durationMs = Math.round(performance.now() - t0);

    // Step 3: Return based on mode
    if (returnMode === "url") {
      try {
        const writeResult = await writePngToPublicHeatmaps(overlayResult.buffer);
        
        jlog({
          ts: new Date().toISOString(),
          level: "info",
          requestId,
          route,
          method: "POST",
          status: 200,
          durationMs,
          phase: "write_ok",
          filename: writeResult.filename
        });

        return res.status(200).json({
          url: writeResult.urlPath,
          meta: {
            sourceUrl: url,
            device,
            returnMode,
            width: overlayResult.width,
            height: overlayResult.height,
            requestId,
            durationMs
          }
        });
      } catch (err: any) {
        jlog({
          ts: new Date().toISOString(),
          level: "error",
          requestId,
          route,
          phase: "write_failed",
          errorMessage: err?.message
        });
        
        return res.status(500).json({
          error: "Failed to write file",
          code: "WRITE_FAILED",
          message: err?.message,
          requestId
        });
      }
    } else {
      // Return base64
      jlog({
        ts: new Date().toISOString(),
        level: "info",
        requestId,
        route,
        method: "POST",
        status: 200,
        durationMs,
        phase: "complete"
      });

      return res.status(200).json({
        base64: overlayResult.base64,
        meta: {
          sourceUrl: url,
          device,
          returnMode,
          width: overlayResult.width,
          height: overlayResult.height,
          requestId,
          durationMs
        }
      });
    }

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

    // Screenshot errors
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

    // Unknown errors
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
    
    return res.status(500).json({
      error: "Internal Server Error",
      code: "UNKNOWN",
      requestId
    });
  }
}

export async function getHeatmap(_req: Request, res: Response) {
  return res.status(200).json({
    message: "Heatmap API is operational",
    version: "1.0.0",
    endpoints: {
      POST: "/api/v1/heatmap - Generate heatmap with overlay"
    }
  });
}
