import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// All APIs are registered in routes.ts
// server/index.ts (very top – first imports)
import { neonConfig } from "@neondatabase/serverless";
import path from "path";
import { fileURLToPath } from "url";
import { buildHealthReport } from "./health"; // <-- added
import fs from "fs";

// Hard block any WS usage if some file tries to set it up later
// @ts-ignore
delete neonConfig.webSocketConstructor;
// @ts-ignore
delete (neonConfig as any).wsProxy;
// @ts-ignore
delete (neonConfig as any).webSocketProxy;

const app = express();
app.use(express.json({ limit: "10mb" }));  // or 20mb if you prefer
app.use(express.urlencoded({ extended: false }));

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), "public")));

// ✅ /health route — lightweight readiness check
app.get("/health", (req, res) => {
  const payload = buildHealthReport();
  res.status(200).json(payload);
});

// Request timing + compact API response logger
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Health check is handled in routes.ts

  // ✅ Safer centralized error handler: log & respond, don't crash the process
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || "Internal Server Error";

    // Basic logging (avoid throwing to keep prod stable)
    try {
      log(`ERROR ${status}: ${message}`);
      if (req?.method && req?.path) {
        log(`at ${req.method} ${req.path}`);
      }
      if (app.get("env") === "development" && err?.stack) {
        // In dev you can surface the stack in logs
        log(err.stack);
      }
    } catch {
      /* ignore logging failures */
    }

    if (!res.headersSent) {
      // Optionally include stack in dev responses (omit in prod)
      const payload: Record<string, any> = { message };
      if (app.get("env") === "development" && err?.stack) {
        payload.stack = err.stack;
      }
      res.status(status).json(payload);
    } else {
      // If headers already sent, delegate to Express default error handler
      next(err);
    }
  });

  // Dev vs Prod: Vite middleware or static serving
  if (app.get("env") === "development") {
    await setupVite(app, server);
    
    // In development, also serve built client for /dev/heatmap route
    const distPublic = path.resolve(process.cwd(), "dist", "public");
    if (fs.existsSync(distPublic)) {
      console.log("[Phase9] Serving client from:", distPublic);
      app.use(express.static(distPublic));
      app.get("/dev/heatmap", (_req, res) => {
        res.sendFile(path.join(distPublic, "index.html"));
      });
    } else {
      console.warn("[Phase9] dist/public not found; /dev/heatmap will 404 (safe).");
    }
  } else {
    // Guarded static serving for Phase 9
    const distPublic = path.resolve(process.cwd(), "dist", "public");

    if (fs.existsSync(distPublic)) {
      console.log("[Phase9] Serving client from:", distPublic);
      app.use(express.static(distPublic));

      // Serve the dev heatmap route
      app.get("/dev/heatmap", (_req, res) => {
        res.sendFile(path.join(distPublic, "index.html"));
      });
    } else {
      console.warn("[Phase9] dist/public not found; /dev/heatmap will 404 (safe).");
    }
    serveStatic(app);
  }

  // ALWAYS serve on PORT (only open port in the environment). Default 5000 locally.
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();