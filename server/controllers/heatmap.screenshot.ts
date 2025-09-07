// FILE: server/controllers/heatmap.screenshot.ts
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapRequestSchema } from "../schemas/heatmap";
import { screenshotToBase64, ScreenshotError } from "../services/screenshot";

function jlog(o: any) {
  console.log(JSON.stringify(o));
}

export async function postHeatmapScreenshot(req: Request, res: Response) {
  const t0 = performance.now();
  const requestId = nanoid();
  const route = "/api/v1/heatmap";
  try {
    const parsed = heatmapRequestSchema.parse(req.body);

    let image: string;
    
    try {
      image = await screenshotToBase64({
        url: parsed.url,
        device: parsed.device,
        fullPage: false, // change to true later if you want
      });
    } catch (screenshotErr: any) {
      // Fallback to hosted screenshot service if Chromium fails to launch
      if (screenshotErr?.code === "LAUNCH_FAILED") {
        jlog({
          ts: new Date().toISOString(),
          level: "warn",
          requestId,
          route,
          method: "POST",
          message: "Chromium launch failed, using fallback screenshot service",
          originalError: screenshotErr.message,
        });

        // Use Thum.io as fallback (free, no API key needed)
        const fallbackUrl = `https://image.thum.io/get/png/width/1440/${encodeURIComponent(parsed.url)}`;
        
        const resp = await fetch(fallbackUrl);
        if (!resp.ok) {
          throw new ScreenshotError(
            "SCREENSHOT_FAILED",
            `Fallback screenshot service failed with status ${resp.status}`
          );
        }
        
        const buf = Buffer.from(await resp.arrayBuffer());
        image = `data:image/png;base64,${buf.toString("base64")}`;
      } else {
        // Re-throw other screenshot errors
        throw screenshotErr;
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
    });

    return res.status(200).json({
      meta: {
        sourceUrl: parsed.url,
        device: parsed.device,
        returnMode: parsed.returnMode, // still accepted, even though we’re returning base64
        requestId,
        durationMs,
      },
      image, // <- actual PNG as data URL
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);

    // Validation errors (zod)
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
      return res
        .status(400)
        .json({
          error: "Bad Request",
          code: "VALIDATION_ERROR",
          details,
          requestId,
        });
    }

    // Categorized screenshot errors
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
      return res
        .status(500)
        .json({
          error: "Failed to generate screenshot",
          code: err.code,
          message: err.message,
          requestId,
        });
    }

    // Unknown
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
