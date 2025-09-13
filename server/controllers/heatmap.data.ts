// server/controllers/heatmap.data.ts
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
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
  const route = "/api/v1/heatmap/data";
  const reqId = (res.locals as any).reqId || nanoid();
  (res.locals as any).reqId = reqId;

  const { url, device = "desktop", dataPoints } = req.body ?? {};

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

  try {
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

    const meta = { ...resp.meta, reqId };
    return res.status(200).json({
      base64: resp.base64,
      meta,
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);

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
