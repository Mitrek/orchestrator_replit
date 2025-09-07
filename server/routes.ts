// FILE: server/routes.ts
import { createServer, type Server } from "http";
import type { Express, Request, Response } from "express";

import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

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
import { ensurePremium } from "./middleware/ensurePremium";
import { generateHeatmap } from "./services/heatmap";
import { perIpLimiter, requestTimeout } from "./middleware/limits";
import { postHeatmapStub, postHeatmapDataStub } from "./controllers/heatmap";
import { makeDummyPngBase64 } from "./services/imaging";
import { postHeatmapScreenshot } from "./controllers/heatmap.screenshot";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
import { diagPuppeteerLaunch } from "./controllers/puppeteer.diagnostics";

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

  app.post("/api/auth/login", async (req, res) => {
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

  // ------------------------- Heatmap (Phase 1 stubs) -------------------------
  app.post(
    "/api/v1/heatmap",
    perIpLimiter,
    requestTimeout(15_000),
    postHeatmapScreenshot,
  );

  app.post(
    "/api/v1/heatmap/data",
    perIpLimiter,
    requestTimeout(15_000),
    postHeatmapDataStub,
  );

  // Heatmap routes
  app.get("/api/v1/heatmap/dummy", (_req, res) => {
    res.json({ image: makeDummyPngBase64() });
  });

  // Add the missing POST routes
  app.post("/api/v1/heatmap", postHeatmapScreenshot);
  app.post("/api/v1/heatmap/screenshot", postHeatmapScreenshot);

  // Puppeteer diagnostics
  app.get("/api/v1/puppeteer/launch", diagPuppeteerLaunch);

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
      const body = crypto.randomBytes(24).toString("base64url"); // ~32 url-safe
      const plaintextKey = `ai_lure_${keyPrefixHex}_${body}`;

      const keyHash = await bcrypt.hash(plaintextKey, 12);
      const displayPrefix = `ai_lure_${keyPrefixHex}`;

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

  const httpServer = createServer(app);
  return httpServer;
}