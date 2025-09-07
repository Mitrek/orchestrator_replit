// FILE: server/controllers/heatmap.ts
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { performance } from "node:perf_hooks";
import {
  heatmapRequestSchema,
  heatmapDataRequestSchema,
} from "../schemas/heatmap";

type LogLine = {
  ts: string;
  level: "info" | "warn" | "error";
  requestId: string;
  route: string;
  method: string;
  status?: number;
  durationMs?: number;
  ip?: string;
  device?: string;
  returnMode?: string;
  hasDataPoints?: boolean;
  dataPointsCount?: number;
  errorCode?: string;
  errorMessage?: string;
  validationErrors?: Array<{ path: string; message: string }>;
};

function log(line: LogLine) {
  // One-line JSON logs
  console.log(JSON.stringify(line));
}

export async function postHeatmapStub(req: Request, res: Response) {
  const start = performance.now();
  const requestId = nanoid();
  const route = "/api/v1/heatmap";

  try {
    const parsed = heatmapRequestSchema.parse(req.body);

    const durationMs = Math.round(performance.now() - start);
    log({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      route,
      method: "POST",
      status: 200,
      durationMs,
      ip: req.ip,
      device: parsed.device,
      returnMode: parsed.returnMode,
    });

    return res.status(200).json({
      meta: {
        sourceUrl: parsed.url,
        device: parsed.device,
        returnMode: parsed.returnMode,
        requestId,
        durationMs,
      },
      result: {
        status: "stubbed",
        note: "Phase1 skeleton: no processing yet",
      },
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    const details =
      err?.issues?.map((i: any) => ({
        path: i.path?.join(".") || "",
        message: i.message,
      })) ?? [];

    log({
      ts: new Date().toISOString(),
      level: "warn",
      requestId,
      route,
      method: "POST",
      status: 400,
      durationMs,
      ip: req.ip,
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
}

export async function postHeatmapDataStub(req: Request, res: Response) {
  const start = performance.now();
  const requestId = nanoid();
  const route = "/api/v1/heatmap/data";

  try {
    const parsed = heatmapDataRequestSchema.parse(req.body);

    const durationMs = Math.round(performance.now() - start);
    log({
      ts: new Date().toISOString(),
      level: "info",
      requestId,
      route,
      method: "POST",
      status: 200,
      durationMs,
      ip: req.ip,
      device: parsed.device,
      returnMode: parsed.returnMode,
      hasDataPoints: Array.isArray(parsed.dataPoints),
      dataPointsCount: parsed.dataPoints.length,
    });

    return res.status(200).json({
      meta: {
        sourceUrl: parsed.url,
        device: parsed.device,
        returnMode: parsed.returnMode,
        requestId,
        durationMs,
      },
      result: {
        status: "stubbed",
        note: "Phase1 skeleton: no processing yet",
      },
    });
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    const details =
      err?.issues?.map((i: any) => ({
        path: i.path?.join(".") || "",
        message: i.message,
      })) ?? [];

    log({
      ts: new Date().toISOString(),
      level: "warn",
      requestId,
      route,
      method: "POST",
      status: 400,
      durationMs,
      ip: req.ip,
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
}
