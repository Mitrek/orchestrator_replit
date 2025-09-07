
import { type Express } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { log } from "./vite";
import { db } from "./db";
import { users, requestLogs, integrations, apiKeys } from "../shared/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { createServer } from "http";
import { authenticateToken, apiKeyAuth } from "./middleware/apiKeyAuth";
import { nanoid } from "nanoid";

const JWT_SECRET = process.env.JWT_SECRET || "your-dev-secret-change-in-production";

// Create rate limiter instances
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // limit each IP to 120 requests per windowMs
  message: "API rate limit exceeded, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const keyGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each user to 10 key generations per hour
  message: "Too many API keys created, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Dynamic rate limiting per API key
const rateLimitByApiKey = async (req: any, res: any, next: any) => {
  if (!req.apiKey) return next();
  
  const now = new Date();
  const windowStart = new Date(now.getTime() - (req.apiKey.rateLimitWindow * 1000));
  
  // Count recent requests for this API key
  const recentRequests = await db
    .select({ count: count() })
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.apiKeyId, req.apiKey.id),
        sql`${requestLogs.timestamp} >= ${windowStart}`
      )
    );

  const requestCount = recentRequests[0]?.count || 0;
  
  if (requestCount >= req.apiKey.rateLimitMax) {
    return res.status(429).json({ 
      error: "API key rate limit exceeded",
      limit: req.apiKey.rateLimitMax,
      windowSeconds: req.apiKey.rateLimitWindow,
      resetTime: new Date(windowStart.getTime() + (req.apiKey.rateLimitWindow * 1000))
    });
  }
  
  next();
};

export function registerRoutes(app: Express) {
  const server = createServer(app);

  // Global rate limiting
  app.use(globalLimiter);

  // Mock integrations with improved responses
  const mockIntegrations = {
    hello: () => ({ message: "Hello from AI-lure Orchestrator!", timestamp: new Date().toISOString() }),
    weather: (data?: any) => ({ 
      location: data?.location || "Unknown", 
      temperature: Math.round(Math.random() * 30 + 10) + "°C",
      condition: ["sunny", "cloudy", "rainy"][Math.floor(Math.random() * 3)],
      timestamp: new Date().toISOString()
    }),
    news: (data?: any) => ({ 
      category: data?.category || "general",
      headlines: [
        "Breaking: AI technology advances rapidly",
        "Market update: Tech stocks rise",
        "Weather: Sunny skies ahead"
      ].slice(0, data?.limit || 3),
      timestamp: new Date().toISOString()
    }),
    social: (data?: any) => ({ 
      platform: data?.platform || "twitter",
      posts: [
        { text: "Great day for coding!", likes: 42 },
        { text: "AI is transforming everything", likes: 18 }
      ].slice(0, data?.limit || 2),
      timestamp: new Date().toISOString()
    }),
    ai: (data?: any) => ({ 
      model: data?.model || "gpt-3.5",
      response: data?.prompt ? `Response to: ${data.prompt}` : "Hello! How can I help you today?",
      tokens: Math.floor(Math.random() * 100 + 20),
      timestamp: new Date().toISOString()
    })
  };

  // -------------------------- Auth Routes ---------------------------
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(400).json({ error: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          password: hashedPassword,
        })
        .returning({ id: users.id, email: users.email });

      const token = jwt.sign(
        { userId: newUser.id, email: newUser.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        success: true,
        token,
        user: { id: newUser.id, email: newUser.email },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Verify token endpoint
  app.get("/api/auth/verify", authenticateToken, (req: any, res) => {
    res.json({ user: req.user });
  });

  // ------------------------- Dashboard API --------------------------
  app.get("/api/dashboard", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.userId;

      // Get user's API keys count
      const apiKeysCount = await db
        .select({ count: count() })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId));

      // Get recent request logs count (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const requestsCount = await db
        .select({ count: count() })
        .from(requestLogs)
        .innerJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
        .where(
          and(
            eq(apiKeys.userId, userId),
            sql`${requestLogs.timestamp} >= ${thirtyDaysAgo}`
          )
        );

      // Get recent activity (last 10 requests)
      const recentActivity = await db
        .select({
          endpoint: requestLogs.endpoint,
          statusCode: requestLogs.statusCode,
          timestamp: requestLogs.timestamp,
          keyName: apiKeys.name,
        })
        .from(requestLogs)
        .innerJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
        .where(eq(apiKeys.userId, userId))
        .orderBy(desc(requestLogs.timestamp))
        .limit(10);

      res.json({
        stats: {
          totalApiKeys: apiKeysCount[0]?.count || 0,
          totalRequests: requestsCount[0]?.count || 0,
          activeIntegrations: 5, // Mock data
          successRate: "99.2%", // Mock data
        },
        recentActivity,
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  // ------------------------- API Keys Management ----------------------
  app.get("/api/keys", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      
      const userKeys = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPreview: apiKeys.keyPreview,
          rateLimitMax: apiKeys.rateLimitMax,
          rateLimitWindow: apiKeys.rateLimitWindow,
          isActive: apiKeys.isActive,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .orderBy(desc(apiKeys.createdAt));

      res.json(userKeys);
    } catch (error) {
      console.error("Keys fetch error:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/keys", authenticateToken, keyGenerationLimiter, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const { name, rateLimitMax = 100, rateLimitWindow = 3600 } = req.body; // defaults: 100 req/hour

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: "Key name is required" });
      }

      // Generate a unique API key
      const rawKey = `ak_${nanoid(32)}`;
      const keyHash = await bcrypt.hash(rawKey, 12);
      const keyPreview = `ak_...${rawKey.slice(-4)}`;

      const [newKey] = await db
        .insert(apiKeys)
        .values({
          userId,
          name: name.trim(),
          keyHash,
          keyPreview,
          rateLimitMax: Math.min(Math.max(rateLimitMax, 1), 10000), // Between 1-10000
          rateLimitWindow: Math.min(Math.max(rateLimitWindow, 60), 86400), // Between 1min-24h
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPreview: apiKeys.keyPreview,
          rateLimitMax: apiKeys.rateLimitMax,
          rateLimitWindow: apiKeys.rateLimitWindow,
          createdAt: apiKeys.createdAt,
        });

      res.json({
        ...newKey,
        rawKey, // Only returned once during creation
      });
    } catch (error) {
      console.error("Key creation error:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/keys/:keyId", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const keyId = parseInt(req.params.keyId);

      const deleted = await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
        .returning({ id: apiKeys.id });

      if (deleted.length === 0) {
        return res.status(404).json({ error: "API key not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Key deletion error:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // ------------------------- Request Logs ---------------------------
  app.get("/api/logs", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;

      const logs = await db
        .select({
          id: requestLogs.id,
          endpoint: requestLogs.endpoint,
          method: requestLogs.method,
          statusCode: requestLogs.statusCode,
          responseTime: requestLogs.responseTime,
          timestamp: requestLogs.timestamp,
          keyName: apiKeys.name,
        })
        .from(requestLogs)
        .innerJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
        .where(eq(apiKeys.userId, userId))
        .orderBy(desc(requestLogs.timestamp))
        .limit(limit)
        .offset(offset);

      res.json({ logs, page, limit, hasMore: logs.length === limit });
    } catch (error) {
      console.error("Logs fetch error:", error);
      res.status(500).json({ error: "Failed to fetch request logs" });
    }
  });

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

        const results: Record<string, any> = {};

        // Process each integration
        for (const integration of integrations) {
          if (typeof integration !== "string") {
            results[integration] = { error: "Integration must be a string" };
            continue;
          }

          const handler = mockIntegrations[integration as keyof typeof mockIntegrations];
          if (!handler) {
            results[integration] = { error: `Integration '${integration}' not found` };
            continue;
          }

          try {
            results[integration] = handler(data);
          } catch (integrationError) {
            results[integration] = { error: `Integration '${integration}' failed` };
          }
        }

        const response = {
          success: true,
          timestamp: new Date().toISOString(),
          results,
        };

        res.json(response);
      } catch (error) {
        statusCode = error instanceof Error && error.message.includes("required") ? 400 : 500;
        errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.status(statusCode).json({
          success: false,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      } finally {
        // Log the request
        const responseTime = Date.now() - startTime;
        
        try {
          await db.insert(requestLogs).values({
            apiKeyId: req.apiKey?.id,
            endpoint: "/api/v1/orchestrate",
            method: "POST",
            statusCode,
            responseTime,
            errorMessage,
          });
        } catch (logError) {
          console.error("Failed to log request:", logError);
        }
      }
    }
  );

  // ------------------------- Heatmap Routes ---------------------------
  
  // Generate heatmap endpoint
  app.post("/api/v1/heatmap", apiLimiter, async (req, res) => {
    try {
      const { url, viewport, mode } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Validate mode
      const validModes = ["desktop", "mobile", "tablet"];
      const ret = validModes.includes(mode) ? mode : "desktop";
      
      console.log(`[/api/v1/heatmap] Generating heatmap for ${url} in ${ret} mode...`);

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

  // Data-driven heatmap endpoint
  app.post("/api/v1/heatmap/data", apiLimiter, async (req, res) => {
    try {
      const { url, dataPoints, viewport, mode } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      if (!dataPoints || !Array.isArray(dataPoints)) {
        return res.status(400).json({ error: "dataPoints array is required" });
      }
      
      // Validate mode
      const validModes = ["desktop", "mobile", "tablet"];
      const ret = validModes.includes(mode) ? mode : "desktop";
      
      console.log(`[/api/v1/heatmap/data] Generating data-driven heatmap for ${url}...`);

      const { generateDataHeatmap } = await import("./services/heatmapGenerator");
      const result = await generateDataHeatmap({ url, dataPoints, viewport, mode: ret });
      
      return res.json(result);
    } catch (err) {
      console.error("[/api/v1/heatmap/data] error:", err);
      return res.status(500).json({ 
        error: "Failed to generate data-driven heatmap",
        details: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });

  return server;
}
