import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import type { Database } from "./db";
import { registerRoutes } from "./routes";
import { requestTracingMiddleware } from "./middleware/requestTracing";

// server/index.ts (very top – first imports)
import { neonConfig } from "@neondatabase/serverless";
import { buildHealthReport } from "./health"; // <-- added

// Hard block any WS usage if some file tries to set it up later
// @ts-ignore
delete neonConfig.webSocketConstructor;
// @ts-ignore
delete (neonConfig as any).wsProxy;
// @ts-ignore
delete (neonConfig as any).webSocketProxy;

export async function createServer(db: Database): Promise<Server> {
  const app = express();

  // Health endpoint
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  // CORS configuration
  const corsOptions = {
    origin: (origin: any, callback: any) => {
      callback(null, true);
    },
    credentials: true,
  };

  app.use(cors(corsOptions));

  app.use(express.json({ limit: "10mb" })); // or 20mb if you prefer
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

  // Register routes and get HTTP server
  const httpServer = await registerRoutes(app);

  // Guarded static serving of client build (after API routes)
  const clientDist = path.resolve(process.cwd(), "client", "dist");

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("/dev/heatmap", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    console.warn("[Phase9] client/dist not found; /dev/heatmap will 404 (safe).");
  }

  return httpServer;
}