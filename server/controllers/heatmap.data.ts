
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapDataRequestSchema } from "../schemas/heatmap";
import { getExternalScreenshotBase64 } from "../services/screenshotExternal";
import { getScreenshotBuffer } from "../services/screenshot";
import { 
  getImageDimensions, 
  mapNormalizedPointsToPixels, 
  accumulateHeat, 
  blurHeatBuffer, 
  heatBufferToGreyscalePngBase64,
  heatBufferToColorRgba,
  compositeHeatOverScreenshot
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
    
    // Single source of truth - destructure all knobs at once
    const {
      url,
      device = "desktop",
      dataPoints,
      radiusPx = 40,
      blurPx = 24,
      intensityPerPoint = 1.0,
      debugHeat = false,

      // Step-3 knobs (new)
      alpha: alphaRaw = 0.60,
      blendMode = "lighter",
      ramp = "classic",
      clipLowPercent = 0,
      clipHighPercent = 100
    } = parsed;
    
    // Clamp alpha
    const alpha = Math.max(0, Math.min(1, alphaRaw));

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

    // Get screenshot with fallback logic (same as AI path)
    let screenshotBase64: string;
    let screenshotProvider: string;
    
    try {
      // Primary: try getScreenshotBuffer() (has retry logic and external providers)
      try {
        const { png } = await getScreenshotBuffer(url, device);
        screenshotBase64 = `data:image/png;base64,${png.toString("base64")}`;
        screenshotProvider = "primary";
        
        jlog({
          ts: new Date().toISOString(),
          level: "info",
          requestId,
          route,
          phase: "screenshot_ok",
          provider: "primary"
        });
      } catch (primaryErr: any) {
        jlog({
          ts: new Date().toISOString(),
          level: "warn",
          requestId,
          route,
          phase: "primary_screenshot_failed",
          errorMessage: primaryErr?.message
        });
        
        // Fallback: try external providers directly
        const screenshotResult = await getExternalScreenshotBase64(url, device);
        screenshotBase64 = screenshotResult.image;
        screenshotProvider = screenshotResult.provider;
        
        jlog({
          ts: new Date().toISOString(),
          level: "info",
          requestId,
          route,
          phase: "screenshot_ok",
          provider: screenshotProvider
        });
      }
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
      const dimensions = await getImageDimensions(screenshotBase64);
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
    let nonZeroCountBlurred = heatResult.nonZeroCount; // default to pre-blur count
    if (blurPx > 0) {
      const tBlur = performance.now();
      try {
        const blurResult = blurHeatBuffer(heatResult.buffer, width, height, { blurPx });
        heatResult.buffer = blurResult.buffer;
        heatResult.maxValue = blurResult.maxValue;
        
        // Count non-zero pixels after blur
        nonZeroCountBlurred = 0;
        for (let i = 0; i < heatResult.buffer.length; i++) {
          if (heatResult.buffer[i] > 0) {
            nonZeroCountBlurred++;
          }
        }
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

    // Step 3: Colorize heat buffer
    let heatRgba: Uint8ClampedArray;
    const tColorize = performance.now();
    try {
      heatRgba = heatBufferToColorRgba(heatResult.buffer, width, height, {
        ramp,
        clipLowPercent,
        clipHighPercent
      });
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "colorize_failed",
        errorMessage: err?.message,
      });

      return res.status(500).json({
        error: "colorize_failed",
        phase: "colorize",
        details: err?.message || String(err),
        requestId
      });
    }
    const colorizeDurationMs = Math.round(performance.now() - tColorize);

    // Step 3: Composite heat over screenshot
    let finalImage: string;
    const tComposite = performance.now();
    try {
      finalImage = await compositeHeatOverScreenshot({
        screenshotPngBase64: screenshotBase64,
        heatRgba,
        width,
        height,
        alpha,
        blendMode
      });
    } catch (err: any) {
      jlog({
        ts: new Date().toISOString(),
        level: "error",
        requestId,
        route,
        phase: "composite_failed",
        errorMessage: err?.message,
      });

      return res.status(500).json({
        error: "composite_failed",
        phase: "composite",
        details: err?.message || String(err),
        requestId
      });
    }
    const compositeDurationMs = Math.round(performance.now() - tComposite);

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
        blur: blurDurationMs,
        colorize: colorizeDurationMs,
        composite: compositeDurationMs
      },
      width,
      height,
      provider: screenshotProvider
    });

    // Prepare sample of mapped points (first 5)
    const samplePoints = dataPoints.slice(0, 5).map((point, index) => ({
      xNorm: point.x,
      yNorm: point.y,
      xPx: pixelPoints[index].xPx,
      yPx: pixelPoints[index].yPx
    }));

    return res.status(200).json({
      image: finalImage,
      heat: {
        width,
        height,
        maxValue: heatResult.maxValue,
        nonZeroCount: heatResult.nonZeroCount,
        nonZeroCountBlurred,
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
        alpha,
        blendMode,
        ramp,
        clipLowPercent,
        clipHighPercent,
        phase: "phase5.step3"
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
