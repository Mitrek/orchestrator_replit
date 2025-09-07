// FILE: server/middleware/limits.ts
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

export const perIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // 60 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too Many Requests",
      code: "RATE_LIMITED",
      requestId: req.headers["x-request-id"] || "",
    });
  },
});

// Simple 15s timeout middleware
export function requestTimeout(ms = 15000) {
  return function (req: Request, res: Response, next: NextFunction) {
    res.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(503).json({
          error: "Service Unavailable",
          code: "REQUEST_TIMEOUT",
        });
      }
      // Ensure connection is closed
      try { res.end(); } catch {}
    });
    next();
  };
}
