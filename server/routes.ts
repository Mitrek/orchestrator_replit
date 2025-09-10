// FILE: server/routes.ts
import { createServer, type Server } from "http";
import type { Express } from "express";

import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import express from "express"; // Import express to use express.static
import path from "path"; // Import path for path joining

import { requestTracingMiddleware, addReqIdToResponse } from "./middleware/requestTracing";

import { storage } from "./storage";
import {
  loginSchema,
  registerSchema,
  insertApiKeySchema,
  users, // from @shared/schema via drizzle model re-exports
} from "@shared/schema";

import { db, withDbRetry } from "./db";
import { eq } from "drizzle-orm";

import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { perIpLimiter, requestTimeout } from "./middleware/limits";
import { makeDummyPngBase64 } from "./services/imaging";
import { postHeatmapScreenshot } from "./controllers/heatmap.screenshot";
import { postHeatmap } from "./controllers/heatmap";
import { diagPuppeteerLaunch } from "./controllers/puppeteer.diagnostics";
import { postHeatmapData } from "./controllers/heatmap.data";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// ----------------------------- Rate Limiting ---------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// If apiKeyAuth attached req.apiKey, we can rate-limit per key using your storage stats
async function rateLimitByApiKey(req: any, res: any, next: any) {
  try {
    const key = req.apiKey;
    if (!key) return next();

    const stats = await storage.getApiKeyUsageStats(key.id, 1);
    if (stats.count >= key.rateLimit) {
      return res.status(429).json({
        error: "Rate limit exceeded for this API key",
        limit: key.rateLimit,
        used: stats.count,
        resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    }
    next();
  } catch (err) {
    console.error("Rate limiting error:", err);
    next(); // fail-open on limiter errors
  }
}

// ----------------------------- JWT Middleware --------------------------------
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
}

// ----------------------------- Routes ----------------------------------------
export async function registerRoutes(app: Express): Promise<Server> {
  // Add request tracing middleware
  app.use(requestTracingMiddleware);
  app.use(addReqIdToResponse);
  // ------------------------- Auth (email/password) ---------------------------
  app.post("/api/auth/register", apiLimiter, async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { confirmPassword, ...userData } = validatedData;

      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        {
          expiresIn: "24h",
        },
      );

      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", apiLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword)
        return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        {
          expiresIn: "24h",
        },
      );

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ------------------------- Heatmap (API) -------------------------
  // AI-assisted heatmap endpoint
  app.post(
    "/api/v1/heatmap",
    perIpLimiter,
    requestTimeout(45_000),
    async (req, res) => {
      try {
        const { 
          url, 
          device = "desktop", 
          engine,
          parity = process.env.PARITY_MODE !== "false",
          knobs 
        } = req.body;
        
        if (!url || typeof url !== 'string') {
          return res.status(400).json({ error: "URL is required" });
        }

        // Check for legacy engine and reject
        if (engine === "legacy") {
          return res.status(400).json({ error: "legacy engine is disabled" });
        }

        // Import validation helpers
        const { ALLOWED_DEVICES } = await import("./services/validation");
        
        if (!ALLOWED_DEVICES.includes(device as any)) {
          return res.status(400).json({ 
            error: "Invalid device", 
            allowed: ALLOWED_DEVICES 
          });
        }

        const { makeAiHeatmapImage } = await import("./services/aiHeatmap");
        const result = await makeAiHeatmapImage({ 
          url, 
          device, 
          parity,
          knobs 
        });
        
        return res.json(result);
      } catch (error: any) {
        console.error('[/api/v1/heatmap] error:', error?.stack || error);
        
        return res.status(500).json({ 
          error: "INTERNAL_ERROR", 
          details: error?.message?.includes("screenshot") ? "screenshot provider failed" : "internal error"
        });
      }
    }
  );

  // Data-driven heatmap endpoint
  app.post(
    "/api/v1/heatmap/data",
    perIpLimiter,
    requestTimeout(45_000),
    async (req, res) => {
      try {
        const { url, device, dataPoints } = req.body;
        
        if (!url || typeof url !== 'string') {
          return res.status(400).json({ error: "URL is required" });
        }

        if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
          return res.status(400).json({ error: "dataPoints[] required" });
        }

        const { generateDataHeatmap } = await import("./services/heatmap");
        const result = await generateDataHeatmap({ url, device, dataPoints });
        
        return res.json(result);
      } catch (error: any) {
        console.error('[/api/v1/heatmap/data] error:', error?.stack || error);
        return res.status(500).json({ 
          error: "Failed to generate heatmap", 
          details: error?.message 
        });
      }
    }
  );

  app.get("/api/v1/heatmap/dummy", (_req, res) => {
    res.json({ image: makeDummyPngBase64() });
  });

  // Hotspots JSON API
  app.post("/api/v1/heatmap/hotspots", async (req, res) => {
    const startTime = Date.now();

    try {
      const { url, device = "desktop", engine, parity = true } = req.body;

      // Import validation helpers
      const { ALLOWED_DEVICES, DEVICE_MAP } = await import("./services/validation");

      // Validate URL
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }

      // Validate device
      if (!ALLOWED_DEVICES.includes(device as any)) {
        return res.status(400).json({ 
          error: "Invalid device", 
          allowed: ALLOWED_DEVICES 
        });
      }

      // Determine engine
      const selectedEngine = engine || process.env.AI_ENGINE || "phase7";

      let result;
      if (selectedEngine === "legacy") {
        const { getAiHotspotsLegacy } = await import("./services/aiHotspots.legacy");
        result = await getAiHotspotsLegacy({ url, device, parity });
      } else {
        const { getAiHotspotsPhase7 } = await import("./services/aiHotspots");
        result = await getAiHotspotsPhase7({ url, device, parity });
      }

      // Re-sanitize (belt & suspenders)
      const { clampAndValidateHotspots, greedyDeoverlap } = await import("./services/validation");
      const { kept } = clampAndValidateHotspots(result.hotspots);
      let filtered = kept;
      if (parity) {
        filtered = kept.filter(h => h.confidence >= 0.25);
      }
      const finalHotspots = greedyDeoverlap(filtered, { max: 8, iouThreshold: 0.4 });

      const durationMs = Date.now() - startTime;
      const viewport = DEVICE_MAP[device];

      // Log structured line
      console.log(JSON.stringify({
        route: "/api/v1/heatmap/hotspots",
        url,
        device,
        engine: selectedEngine,
        parity,
        durationMs,
        accepted: finalHotspots.length,
        pruned: result.hotspots.length - finalHotspots.length,
        fallback: result.meta.fallback || false
      }));

      res.json({
        hotspots: finalHotspots,
        meta: {
          phase: "phase7",
          engine: "ai",
          device,
          viewport,
          ai: {
            engine: result.meta.engine,
            model: result.meta.engine === "legacy" ? "legacy" : result.meta.model,
            fallback: result.meta.fallback || false,
            promptHash: result.meta.promptHash || undefined,
            checksumOk: result.meta.checksumOk || undefined,
            requested: result.meta.requested,
            accepted: finalHotspots.length,
            pruned: result.meta.requested - finalHotspots.length,
            parity
          },
          timestamp: new Date().toISOString(),
          durationMs
        }
      });

    } catch (error: any) {
      console.error("[/api/v1/heatmap/hotspots] error:", error);
      
      if (error.message?.includes("checksum mismatch")) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(500).json({ 
        error: "Failed to generate hotspots", 
        details: error?.message 
      });
    }
  });

  // Puppeteer diagnostics
  app.get("/api/v1/puppeteer/launch", diagPuppeteerLaunch);

  // System diagnostics
  app.get("/api/v1/heatmap/diagnostics", async (req, res) => {
    const { handleDiagnostics } = await import("./diagnostics");
    await handleDiagnostics(req, res);
  });

  // QA golden generation (admin only)
  app.post("/api/v1/qa/generate-goldens", async (req, res) => {
    try {
      const { generateGoldenImages } = await import("./qa");
      await generateGoldenImages();
      res.json({ success: true, message: "Golden images generated" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to generate golden images", details: error.message });
    }
  });

  // ------------------------- Subscription Checker ----------------------------
  app.get(
    "/api/subscription",
    apiKeyAuth,
    rateLimitByApiKey,
    async (req, res) => {
      try {
        const userId = (req as any).userId as string;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const [row] = await withDbRetry(() =>
          db
            .select({
              status: users.subscriptionStatus,
              periodEnd: users.currentPeriodEnd,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1),
        );

        if (!row) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        const endsAt = row.periodEnd ? new Date(row.periodEnd) : null;

        if (
          row.status === "active" &&
          endsAt &&
          endsAt.getTime() > now.getTime()
        ) {
          const diffMs = endsAt.getTime() - now.getTime();
          const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          return res.json({ daysRemaining });
        }

        if (!endsAt) {
          return res.json({ message: "Subscribe at ai-lure.net" });
        }

        if (endsAt.getTime() <= now.getTime() || row.status !== "active") {
          return res.json({
            message: "Subscription expired, renew at ai-lure.net",
          });
        }

        return res.json({ message: "Subscribe at ai-lure.net" });
      } catch (err) {
        console.error("GET /api/subscription error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // ------------------------- User/Profile (JWT) ------------------------------
  app.get("/api/user/profile", authenticateToken, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ------------------------- API Keys (JWT) ----------------------------------
  app.get("/api/keys", authenticateToken, async (req: any, res) => {
    try {
      const apiKeys = await storage.getApiKeysByUserId(req.user.userId);
      res.json(apiKeys);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/keys", authenticateToken, async (req: any, res) => {
    try {
      const validatedData = insertApiKeySchema.parse({
        ...req.body,
        userId: req.user.userId,
      });

      const keyPrefixHex = crypto.randomBytes(4).toString("hex"); // 8 chars
      const body = crypto.randomBytes(24).toString("base64url"); // ~32 url-safe
      const plaintextKey = `cimple_${keyPrefixHex}_${body}`;

      const keyHash = await bcrypt.hash(plaintextKey, 12);
      const displayPrefix = `cimple_${keyPrefixHex}`;

      const created = await storage.createApiKey({
        ...validatedData,
        keyHash,
        keyPrefix: displayPrefix,
      });

      const {
        id,
        userId,
        name,
        rateLimit,
        isActive,
        keyPrefix,
        createdAt,
        lastUsedAt,
      } = created;

      res.status(201).json({
        apiKey: plaintextKey, // shown once
        name,
        id,
        userId,
        rateLimit,
        isActive,
        keyPrefix,
        createdAt,
        lastUsedAt,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/keys/:id", authenticateToken, async (req: any, res) => {
    try {
      const apiKey = await storage.getApiKey(req.params.id);
      if (!apiKey || apiKey.userId !== req.user.userId) {
        return res.status(404).json({ error: "API key not found" });
      }
      await storage.deleteApiKey(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/keys/:id", authenticateToken, async (req: any, res) => {
    try {
      const apiKey = await storage.getApiKey(req.params.id);
      if (!apiKey || apiKey.userId !== req.user.userId) {
        return res.status(404).json({ error: "API key not found" });
      }
      const updatedKey = await storage.updateApiKey(req.params.id, req.body);
      res.json(updatedKey);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve the dist folder for client routes
  app.use(express.static(path.join(import.meta.dirname, "..", "dist")));

  

  const httpServer = createServer(app);
  return httpServer;
}