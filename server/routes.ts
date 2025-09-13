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

import { perIpLimiter, requestTimeout } from "./middleware/limits";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// ----------------------------- Rate Limiting ---------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});



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

  // ------------------------- Heatmap (API) -------------------------
  // AI-assisted heatmap endpoint
  app.post(
    "/api/v1/heatmap",
    perIpLimiter,
    requestTimeout(45_000),
    async (req, res) => {
      const reqId = res.locals?.reqId || `hmAI_${Date.now()}`;
      try {
        const { url, device = "desktop" } = req.body;
        
        if (!url || typeof url !== 'string') {
          return res.status(400).json({ error: "URL is required" });
        }

        const { generateHeatmap } = await import("./services/heatmap");
        const result = await generateHeatmap({ url, device, reqId });
        
        return res.json(result);
      } catch (error: any) {
        console.error('[/api/v1/heatmap] error:', error?.stack || error);
        
        return res.status(500).json({ 
          error: "INTERNAL_ERROR", 
          details: error?.message,
          reqId 
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
      const reqId = res.locals?.reqId || `hmData_${Date.now()}`;
      try {
        const { url, device, dataPoints } = req.body;
        
        if (!url || typeof url !== 'string') {
          return res.status(400).json({ error: "URL is required" });
        }

        if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
          return res.status(400).json({ error: "dataPoints[] required" });
        }

        const { generateDataHeatmap } = await import("./services/heatmap");
        const result = await generateDataHeatmap({ url, device, dataPoints, reqId });
        
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