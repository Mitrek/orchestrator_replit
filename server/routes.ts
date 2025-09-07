// FILE: server/routes.ts
import { createServer, type Server } from "http";
import type { Express, Request, Response } from "express";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

import { storage } from "./storage";
import {
  loginSchema,
  registerSchema,
  insertApiKeySchema,
  users, // from @shared/schema via drizzle model re-exports
} from "../shared/schema.js";

import { db, withDbRetry } from "./db";
import { eq } from "drizzle-orm";

import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { ensurePremium } from "./middleware/ensurePremium";
// Removed unused import: import { generateHeatmap } from "./services/heatmap";
// Removed unused import: import HeatmapGenerator from "./services/heatmapGenerator.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// File Upload Configuration for heatmap data mode
const uploadsDir = path.join(process.cwd(), 'uploads');
const heatmapsDir = path.join(process.cwd(), 'public', 'heatmaps');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(heatmapsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

// ----------------------------- Rate Limiting ---------------------------------
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: { error: "Rate limit exceeded" },
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
  // ------------------------- Auth (email/password) ---------------------------
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { confirmPassword, ...userData } = validatedData;

      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = await storage.createUser({ ...userData, password: hashedPassword });

      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: "24h",
      });

      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: "24h",
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ------------------------- Premium Gated: Heatmap --------------------------
  // Generate AI-powered heatmap
  app.post("/api/v1/heatmap", apiKeyAuth, ensurePremium, async (req: Request, res: Response) => {
    try {
      const { url, viewport, return: ret = "base64" } = (req as any).body ?? {};
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'url' in body." });
      }
      if (ret !== "base64" && ret !== "url") {
        return res.status(400).json({ error: "Invalid 'return' (use 'base64' or 'url')." });
      }

      const { generateHeatmap } = await import("./services/heatmap");
      const result = await generateHeatmap({ url, viewport, mode: ret });
      
      // Check if we got the fallback tiny image, which indicates an error
      const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ea8ZbsAAAAASUVORK5CYII=";
      if (result.base64?.includes(tinyPngBase64) || result.url?.includes(tinyPngBase64)) {
        return res.status(500).json({ 
          error: "Failed to generate heatmap - system dependencies missing or Puppeteer error",
          details: "Browser process failed to launch"
        });
      }
      
      return res.json(result);
    } catch (err) {
      console.error("[/api/v1/heatmap] error:", err);
      return res.status(500).json({ 
        error: "Failed to generate heatmap",
        details: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });

  // ------------------------- Premium Gated: Data Heatmap ----------------------
  app.post("/api/v1/heatmap/data", apiKeyAuth, ensurePremium, upload.single('dataFile'), async (req: any, res: Response) => {
    try {
      const { url } = req.body;
      const dataFile = req.file;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'url' in body." });
      }
      if (!dataFile) {
        return res.status(400).json({ error: "Missing 'dataFile' in upload." });
      }

      const { default: HeatmapGenerator } = await import("./services/heatmapGenerator.js");
      const generator = new HeatmapGenerator();
      const timestamp = Date.now();
      const outputBaseName = `heatmap-data-${timestamp}`;
      const outputBasePath = path.join(heatmapsDir, outputBaseName);

      // Start generation asynchronously
      generator.generateSegmentedHeatmaps(url, dataFile.path, outputBasePath)
        .then(() => {
          // Clean up uploaded file
          fs.unlinkSync(dataFile.path);
          console.log(`Data heatmap generation completed for ${url}`);
        })
        .catch((error) => {
          console.error('Data heatmap generation failed:', error);
          // Clean up uploaded file even on error
          if (fs.existsSync(dataFile.path)) {
            fs.unlinkSync(dataFile.path);
          }
        });

      res.status(202).json({
        message: 'Data heatmap generation started. Check back for results.',
        results: {
          desktop: `/heatmaps/${outputBaseName}-desktop.png`,
          tablet: `/heatmaps/${outputBaseName}-tablet.png`,
          mobile: `/heatmaps/${outputBaseName}-mobile.png`
        }
      });
    } catch (err) {
      console.error("[/api/v1/heatmap/data] error:", err);
      return res.status(500).json({ error: "Failed to start heatmap generation." });
    }
  });

  // ------------------------- Subscription Checker ----------------------------
  app.get("/api/subscription", apiKeyAuth, async (req, res) => {
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
          .limit(1)
      );

      if (!row) return res.status(404).json({ error: "User not found" });

      const now = new Date();
      const endsAt = row.periodEnd ? new Date(row.periodEnd) : null;

      if (row.status === "active" && endsAt && endsAt.getTime() > now.getTime()) {
        const diffMs = endsAt.getTime() - now.getTime();
        const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return res.json({ daysRemaining });
      }

      if (!endsAt) {
        return res.json({ message: "Subscribe at ai-lure.net" });
      }

      if (endsAt.getTime() <= now.getTime() || row.status !== "active") {
        return res.json({ message: "Subscription expired, renew at ai-lure.net" });
      }

      return res.json({ message: "Subscribe at ai-lure.net" });
    } catch (err) {
      console.error("GET /api/subscription error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

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
      const body = crypto.randomBytes(24).toString("base64url");   // ~32 url-safe
      const plaintextKey = `ai_lure_${keyPrefixHex}_${body}`;

      const keyHash = await bcrypt.hash(plaintextKey, 12);
      const displayPrefix = `ai_lure_${keyPrefixHex}`;

      const created = await storage.createApiKey({
        ...validatedData,
        keyHash,
        keyPrefix: displayPrefix,
      });

      const {
        id, userId, name, rateLimit, isActive, keyPrefix, createdAt, lastUsedAt,
      } = created;

      res.status(201).json({
        apiKey: plaintextKey, // shown once
        name,
        id, userId, rateLimit, isActive, keyPrefix, createdAt, lastUsedAt,
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

  // ------------------------- Demo Integrations (JWT) -------------------------
  // Removed as per the request.

  // ------------------------- Orchestrate (API key) ---------------------------
  // NOTE: Use the unified apiKeyAuth + your per-key limiter
  app.post(
    "/api/v1/orchestrate",
    apiLimiter,
    apiKeyAuth,
    rateLimitByApiKey,
    async (req: any, res) => {
      const startTime = Date.now();
      let statusCode = 200;
      let errorMessage: string | null = null;

      try {
        const { integrations, data } = req.body;

        if (!integrations || !Array.isArray(integrations)) {
          statusCode = 400;
          throw new Error("integrations array is required");
        }

        // demo helpers
        async function getWeatherData(location: string) {
          try {
            const response = await fetch(
              `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
                location
              )}&appid=demo&units=metric`
            );
            if (!response.ok) {
              return {
                location,
                temperature: Math.round(Math.random() * 30 + 5),
                condition: ["sunny", "cloudy", "rainy"][Math.floor(Math.random() * 3)],
                humidity: Math.round(Math.random() * 100),
                source: "mock_fallback",
              };
            }
            const data = await response.json();
            return {
              location: data.name,
              temperature: Math.round(data.main.temp),
              condition: data.weather[0].main.toLowerCase(),
              humidity: data.main.humidity,
              source: "openweathermap",
            };
          } catch {
            return {
              location,
              temperature: Math.round(Math.random() * 30 + 5),
              condition: ["sunny", "cloudy", "rainy"][Math.floor(Math.random() * 3)],
              humidity: Math.round(Math.random() * 100),
              source: "mock_fallback",
              error: "API unavailable",
            };
          }
        }

        async function getNewsData(category: string = "general") {
          const mockNews = [
            { title: "Tech Innovation Reaches New Heights", source: "TechNews", category: "technology" },
            { title: "Global Markets Show Positive Trends", source: "FinanceDaily", category: "business" },
            { title: "Climate Summit Announces New Initiatives", source: "EnviroUpdate", category: "environment" },
            { title: "Healthcare Breakthrough in AI Diagnostics", source: "MedNews", category: "health" },
          ];
          return {
            category,
            articles: mockNews
              .filter((a) => a.category === category || category === "general")
              .slice(0, 3),
            count: 3,
            source: "mock_news_api",
          };
        }

        const results = await Promise.all(
          integrations.map(async (integration: string) => {
            try {
              let integrationData;
              switch (integration.toLowerCase()) {
                case "weather": {
                  const location = req.body?.data?.location || "San Francisco";
                  integrationData = await getWeatherData(location);
                  break;
                }
                case "news": {
                  const category = req.body?.data?.category || "general";
                  integrationData = await getNewsData(category);
                  break;
                }
                case "hello": {
                  integrationData = {
                    message: "Hello from AI-lure Orchestrator!",
                    timestamp: new Date().toISOString(),
                    user: req.apiKey.name || "API User",
                  };
                  break;
                }
                default: {
                  integrationData = {
                    message: `Integration '${integration}' is not yet implemented`,
                    available_integrations: ["weather", "news", "hello"],
                  };
                }
              }

              return { integration, status: "success", data: integrationData };
            } catch (err: any) {
              return { integration, status: "error", error: err.message };
            }
          })
        );

        const responsePayload = {
          success: true,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
          apiKey: req.apiKey.name,
          results,
        };

        await storage.createRequestLog({
          apiKeyId: req.apiKey.id,
          endpoint: "/api/v1/orchestrate",
          method: "POST",
          statusCode,
          responseTime: Date.now() - startTime,
          requestBody: req.body,
          responseBody: responsePayload,
          errorMessage,
        });

        res.json(responsePayload);
      } catch (error: any) {
        statusCode = error.status || 500;
        errorMessage = error.message;

        await storage.createRequestLog({
          apiKeyId: req.apiKey?.id,
          endpoint: "/api/v1/orchestrate",
          method: "POST",
          statusCode,
          responseTime: Date.now() - startTime,
          requestBody: req.body,
          responseBody: null,
          errorMessage,
        });

        res.status(statusCode).json({ error: errorMessage });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}