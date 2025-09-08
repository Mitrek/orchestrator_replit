
import { Request, Response, NextFunction } from "express";
import { generateRequestId, logRequest } from "../logger";
import { metrics } from "../metrics";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      reqId: string;
      startTime: number;
    }
  }
}

export function requestTracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.reqId = generateRequestId();
  req.startTime = Date.now();

  // Capture response details on finish
  const originalSend = res.send;
  res.send = function(body: any) {
    const durationMs = Date.now() - req.startTime;
    const route = req.route?.path || req.path;
    
    // Update metrics
    if (res.statusCode >= 200 && res.statusCode < 300) {
      metrics.incrementCounter(route, "ok");
    } else if (res.statusCode >= 400 && res.statusCode < 500) {
      metrics.incrementCounter(route, "badRequest");
    } else if (res.statusCode >= 500) {
      metrics.incrementCounter(route, "error");
    }
    
    metrics.recordDuration(route, durationMs);

    // Sample logging (log 1 in 10 successful requests, all errors)
    const shouldLog = res.statusCode >= 400 || Math.random() < 0.1;
    
    if (shouldLog) {
      logRequest({
        ts: new Date().toISOString(),
        level: res.statusCode >= 400 ? "error" : "info",
        phase: "phase8",
        reqId: req.reqId,
        route,
        method: req.method,
        status: res.statusCode,
        url: req.body?.url,
        device: req.body?.device,
        engine: req.body?.engine,
        durationMs,
        cached: typeof body === 'string' ? undefined : JSON.parse(body)?.meta?.ai?.cached,
        errCode: res.statusCode >= 400 ? res.statusCode.toString() : undefined,
        errType: res.statusCode >= 400 ? getErrorType(res.statusCode) : undefined
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

function getErrorType(statusCode: number): string {
  switch (statusCode) {
    case 400: return "BAD_INPUT";
    case 408: return "NAVIGATION_TIMEOUT";
    case 500: return "UNKNOWN";
    default: return "UNKNOWN";
  }
}

// Middleware to add reqId to response meta
export function addReqIdToResponse(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;
  res.json = function(obj: any) {
    if (obj && typeof obj === 'object' && obj.meta) {
      obj.meta.reqId = req.reqId;
    }
    return originalJson.call(this, obj);
  };
  next();
}
