// server/controllers/heatmap.data.ts
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import { heatmapDataRequestSchema } from "../schemas/heatmap";
import { generateDataHeatmap } from "../services/heatmap";

function jlog(o: Record<string, unknown>) {
  try {
    // Keep logs single-line & JSON for easy ingestion
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(o));
  } catch {
    // ignore logging errors
  }
}

export async function postHeatmapData(req: Request, res: Response) {
  const t0 = performance.now();
  const reqId = nanoid();
  const route = "/api/v1/heatmap/data";

  // Add reqId to locals so downstream middleware can also use it (if any)
  (res.locals as any).reqId = reqId;

  try {
    // ---- 1) Validate input (Zod) ----
    const parsed = heatmapDataRequestSchema.parse(req.body);
    const { url, device = "desktop", dataPoints } = parsed;

    jlog({
      ts: new Date().toISOString(),
      level: "info",
      reqId,
      route,
      method: "POST",
      phase: "start",
      device,
      sourceUrl: url,
      pointCount: Array.isArray(dataPoints) ? dataPoints.length : 0,
    });

    // ---- 2) Delegate to service (does screenshot + composite) ----
    const resp = await generateDataHeatmap({
      url,
      device,
      dataPoints,
    });

    const durationMs = Math.round(performance.now() - t0);

    jlog({
      ts: new Date().toISOString(),
      level: "info",
      reqId,
      route,
      method: "POST",
      phase: "done",
      status: 200,
      device,
      sourceUrl: url,
      durationMs,
      width: resp.meta?.viewport?.width,
      height: resp.meta?.viewport?.height,
      engine: resp.meta?.engine,
      pointCount: Array.isArray(dataPoints) ? dataPoints.length : 0,
    });

    // Echo reqId in the response meta for easier tracing
    const meta = { ...resp.meta, reqId };

    return res.status(200).json({
      base64: resp.base64,
      meta,
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);

    // ---- Zod validation error → 400 ----
    if (err?.issues) {
      const details = err.issues.map((i: any) => ({
        path: i.path?.join(".") || "",
        message: i.message,
      }));

      jlog({
        ts: new Date().toISOString(),
        level: "warn",
        reqId,
        route,
        method: "POST",
        phase: "validation_failed",
        status: 400,
        durationMs,
        errorCode: "VALIDATION_ERROR",
        validationErrors: details,
      });

      return res.status(400).json({
        error: "Bad Request",
        code: "VALIDATION_ERROR",
        details,
        reqId,
      });
    }

    // ---- Screenshot/provider failure → 502; else 500 ----
    const msg = err && err.message ? String(err.message) : "unknown";
    const isScreenshotFail =
      /SCREENSHOT_PROVIDER_FAILED/i.test(msg) || /tiny_png/i.test(msg);

    const status = isScreenshotFail ? 502 : 500;
    const code = isScreenshotFail ? "SCREENSHOT_FAILED" : "HEATMAP_DATA_FAILED";

    jlog({
      ts: new Date().toISOString(),
      level: "error",
      reqId,
      route,
      method: "POST",
      phase: "error",
      status,
      durationMs,
      errorCode: code,
      errorMessage: msg,
    });

    return res.status(status).json({
      error: isScreenshotFail
        ? "screenshot_failed"
        : "Failed to generate data heatmap",
      code,
      details: msg,
      reqId,
    });
  }
}
