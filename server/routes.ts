import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  loginSchema, 
  registerSchema, 
  insertApiKeySchema,
  insertIntegrationSchema,
  insertRequestLogSchema
} from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Default limit
  message: { error: "Rate limit exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      return apiKey;
    }
    // Use default IP handling for IPv6 compatibility
    return req.ip;
  }
});

// Middleware to authenticate API keys
async function authenticateApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  try {
    // Get all API keys and check against bcrypt hash
    const allKeys = await storage.getAllApiKeys();
    let matchedKey = null;
    
    for (const key of allKeys) {
      if (key.isActive && await bcrypt.compare(apiKey, key.keyHash)) {
        matchedKey = key;
        break;
      }
    }
    
    if (!matchedKey) {
      return res.status(401).json({ error: "Invalid or inactive API key" });
    }

    // Update last used time
    await storage.updateApiKey(matchedKey.id, { lastUsedAt: new Date() });
    
    req.apiKey = matchedKey;
    req.userId = matchedKey.userId;
    next();
  } catch (error) {
    return res.status(500).json({ error: "Authentication failed" });
  }
}

// Middleware to authenticate JWT tokens
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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

// Rate limiting based on API key limits
async function rateLimitByApiKey(req: any, res: any, next: any) {
  if (!req.apiKey) {
    return next();
  }

  const { apiKey } = req;
  const stats = await storage.getApiKeyUsageStats(apiKey.id, 1); // Last hour
  
  if (stats.count >= apiKey.rateLimit) {
    return res.status(429).json({ 
      error: "Rate limit exceeded for this API key",
      limit: apiKey.rateLimit,
      used: stats.count,
      resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
  }

  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { confirmPassword, ...userData } = validatedData;

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "24h" }
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
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // User profile routes
  app.get("/api/user/profile", authenticateToken, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Key management routes
  app.get("/api/api-keys", authenticateToken, async (req: any, res) => {
    try {
      const apiKeys = await storage.getApiKeysByUserId(req.user.userId);
      res.json(apiKeys);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/api-keys", authenticateToken, async (req: any, res) => {
    try {
      const validatedData = insertApiKeySchema.parse({
        ...req.body,
        userId: req.user.userId,
      });

      // Generate API key using the same format as the other route
      const keyPrefix = crypto.randomBytes(4).toString("hex");     // 8 chars
      const body = crypto.randomBytes(24).toString("base64url");   // ~32 url-safe
      const apiKeyString = `ai_lure_${keyPrefix}_${body}`;
      const keyHash = await bcrypt.hash(apiKeyString, 12);
      const displayPrefix = `ai_lure_${keyPrefix}`;

      const apiKey = await storage.createApiKey({
        ...validatedData,
        keyHash,
        keyPrefix: displayPrefix,
      });

      res.json({ ...apiKey, key: apiKeyString });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/api-keys/:id", authenticateToken, async (req: any, res) => {
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

  app.patch("/api/api-keys/:id", authenticateToken, async (req: any, res) => {
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

  // Dashboard stats
  app.get("/api/dashboard/stats", authenticateToken, async (req: any, res) => {
    try {
      const stats = await storage.getUserDashboardStats(req.user.userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Request logs
  app.get("/api/request-logs", authenticateToken, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getRequestLogsByUserId(req.user.userId, limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Integrations
  app.get("/api/integrations", authenticateToken, async (req: any, res) => {
    try {
      const integrations = await storage.getIntegrationsByUserId(req.user.userId);
      res.json(integrations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/integrations", authenticateToken, async (req: any, res) => {
    try {
      const validatedData = insertIntegrationSchema.parse({
        ...req.body,
        userId: req.user.userId,
      });

      const integration = await storage.createIntegration(validatedData);
      res.json(integration);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Helper function for weather integration
  async function getWeatherData(location: string) {
    try {
      // Using a free weather API (no key required for basic usage)
      const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=demo&units=metric`);
      if (!response.ok) {
        // Fallback to mock data if API fails
        return {
          location,
          temperature: Math.round(Math.random() * 30 + 5), // Random temp 5-35°C
          condition: ["sunny", "cloudy", "rainy"][Math.floor(Math.random() * 3)],
          humidity: Math.round(Math.random() * 100),
          source: "mock_fallback"
        };
      }
      const data = await response.json();
      return {
        location: data.name,
        temperature: Math.round(data.main.temp),
        condition: data.weather[0].main.toLowerCase(),
        humidity: data.main.humidity,
        source: "openweathermap"
      };
    } catch (error) {
      // Return mock data on error
      return {
        location,
        temperature: Math.round(Math.random() * 30 + 5),
        condition: ["sunny", "cloudy", "rainy"][Math.floor(Math.random() * 3)],
        humidity: Math.round(Math.random() * 100),
        source: "mock_fallback",
        error: "API unavailable"
      };
    }
  }

  // Helper function for news integration
  async function getNewsData(category: string = "general") {
    // Mock news data since real news APIs require keys
    const mockNews = [
      { title: "Tech Innovation Reaches New Heights", source: "TechNews", category: "technology" },
      { title: "Global Markets Show Positive Trends", source: "FinanceDaily", category: "business" },
      { title: "Climate Summit Announces New Initiatives", source: "EnviroUpdate", category: "environment" },
      { title: "Healthcare Breakthrough in AI Diagnostics", source: "MedNews", category: "health" },
    ];
    
    return {
      category,
      articles: mockNews.filter(article => article.category === category || category === "general").slice(0, 3),
      count: 3,
      source: "mock_news_api"
    };
  }

  // Main API orchestration endpoint
  app.post("/api/v1/orchestrate", apiLimiter, authenticateApiKey, rateLimitByApiKey, async (req: any, res) => {
    const startTime = Date.now();
    let statusCode = 200;
    let errorMessage = null;

    try {
      const { integrations, data } = req.body;

      if (!integrations || !Array.isArray(integrations)) {
        statusCode = 400;
        throw new Error("integrations array is required");
      }

      // Process each integration
      const results = await Promise.all(
        integrations.map(async (integration: string) => {
          try {
            let integrationData;
            
            switch (integration.toLowerCase()) {
              case "weather":
                const location = data?.location || "San Francisco";
                integrationData = await getWeatherData(location);
                break;
                
              case "news":
                const category = data?.category || "general";
                integrationData = await getNewsData(category);
                break;
                
              case "hello":
                integrationData = {
                  message: "Hello from AI-lure Orchestrator!",
                  timestamp: new Date().toISOString(),
                  user: req.apiKey.name || "API User"
                };
                break;
                
              default:
                integrationData = {
                  message: `Integration '${integration}' is not yet implemented`,
                  available_integrations: ["weather", "news", "hello"]
                };
            }

            return {
              integration,
              status: "success",
              data: integrationData,
            };
          } catch (error: any) {
            return {
              integration,
              status: "error",
              error: error.message,
            };
          }
        })
      );

      const response = {
        success: true,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        apiKey: req.apiKey.name,
        results,
      };

      // Log the request
      await storage.createRequestLog({
        apiKeyId: req.apiKey.id,
        endpoint: "/api/v1/orchestrate",
        method: "POST",
        statusCode,
        responseTime: Date.now() - startTime,
        requestBody: req.body,
        responseBody: response,
        errorMessage,
      });

      res.json(response);
    } catch (error: any) {
      statusCode = error.status || 500;
      errorMessage = error.message;

      // Log the error
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
  });

  const httpServer = createServer(app);
  return httpServer;
}
