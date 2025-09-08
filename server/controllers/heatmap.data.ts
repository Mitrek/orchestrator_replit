
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapDataRequestSchema } from "../schemas/heatmap";
import { getExternalScreenshotBase64 } from "../services/screenshotExternal";
import { 
  getImageDimensions, 
  mapNormalizedPointsToPixels, 
  accumulateHeat, 
  blurHeatBuffer, 
  heatBufferToGreyscalePngBase64 
} from "../services/imaging";

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
    
    // Extract optional knobs from request body
    const radiusPx = req.body.radiusPx ?? 40;
    const intensityPerPoint = req.body.intensityPerPoint ?? 1.0;
    const blurPx = req.body.blurPx ?? 24;
    const debugHeat = req.body.debugHeat ?? false;

    jlog({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      route,
      method: "POST",
      phase: "step2",
      sourceUrl: url,
      device,
      points: dataPoints.length,
      radiusPx,
      blurPx
    });

    // Get screenshot
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

    // Extract image dimensions
    let width: number, height: number;
    try {
      const dimensions = await getImageDimensions(screenshotResult.image);
      width = dimensions.width;
      height = dimensions.height;
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "dimension_extraction_failed",
        errorMessage: err?.message,
      });

      return res.status(500).json({
        error: "dimension_extraction_failed",
        details: err?.message || String(err),
        requestId
      });
    }

    // Map normalized points to pixels
    let pixelPoints;
    const tMap = performance.now();
    try {
      pixelPoints = mapNormalizedPointsToPixels(dataPoints, width, height);
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "mapping_failed",
        errorMessage: err?.message,
      });

      return res.status(500).json({
        error: "accumulation_failed",
        phase: "accumulate",
        details: err?.message || String(err),
        requestId
      });
    }
    const mapDurationMs = Math.round(performance.now() - tMap);

    // Accumulate heat
    let heatResult;
    const tAccumulate = performance.now();
    try {
      heatResult = accumulateHeat(width, height, pixelPoints, {
        radiusPx,
        intensityPerPoint,
        cap: null
      });
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "accumulation_failed",
        errorMessage: err?.message,
      });

      return res.status(500).json({
        error: "accumulation_failed",
        phase: "accumulate",
        details: err?.message || String(err),
        requestId
      });
    }
    const accumulateDurationMs = Math.round(performance.now() - tAccumulate);

    // Apply blur if specified
    let blurDurationMs = 0;
    if (blurPx > 0) {
      const tBlur = performance.now();
      try {
        const blurResult = blurHeatBuffer(heatResult.buffer, width, height, { blurPx });
        heatResult.buffer = blurResult.buffer;
        heatResult.maxValue = blurResult.maxValue;
      } catch (err: any) {
        jlog({
          ts: new Date().toISOString(),
          level: "error",
          requestId,
          route,
          phase: "blur_failed",
          errorMessage: err?.message,
        });

        return res.status(500).json({
          error: "blur_failed",
          phase: "blur",
          details: err?.message || String(err),
          requestId
        });
      }
      blurDurationMs = Math.round(performance.now() - tBlur);
    }

    // Generate debug heat layer if requested
    let heatLayerGray: string | undefined;
    if (debugHeat) {
      try {
        heatLayerGray = heatBufferToGreyscalePngBase64(heatResult.buffer, width, height);
      } catch (err: any) {
        jlog({
          ts: new Date().toISOString(),
          level: "warn",
          requestId,
          route,
          phase: "debug_heat_failed",
          errorMessage: err?.message,
        });
        // Don't fail the request, just skip debug output
      }
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
      timings: {
        map: mapDurationMs,
        accumulate: accumulateDurationMs,
        blur: blurDurationMs
      },
      width,
      height,
      provider: screenshotResult.provider
    });

    // Prepare sample of mapped points (first 5)
    const samplePoints = dataPoints.slice(0, 5).map((point, index) => ({
      xNorm: point.x,
      yNorm: point.y,
      xPx: pixelPoints[index].xPx,
      yPx: pixelPoints[index].yPx
    }));

    return res.status(200).json({
      image: screenshotResult.image,
      heat: {
        width,
        height,
        maxValue: heatResult.maxValue,
        nonZeroCount: heatResult.nonZeroCount,
        sample: samplePoints
      },
      debug: heatLayerGray ? { heatLayerGray } : {},
      meta: {
        sourceUrl: url,
        device,
        countPoints: dataPoints.length,
        radiusPx,
        intensityPerPoint,
        blurPx,
        phase: "phase5.step2"
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
