import {
  users,
  apiKeys,
  requestLogs,
  integrations,
  type User,
  type InsertUser,
  type ApiKey,
  type InsertApiKey,
  type RequestLog,
  type InsertRequestLog,
  type Integration,
  type InsertIntegration
} from "../shared/schema.js";
import { db, withDbRetry } from "./db";
import { eq, and, desc, gte, count } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;

  // API Key methods
  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeysByUserId(userId: string): Promise<ApiKey[]>;
  createApiKey(apiKey: InsertApiKey & { keyHash: string; keyPrefix: string }): Promise<ApiKey>;
  updateApiKey(id: string, updates: Partial<InsertApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: string): Promise<boolean>;

  // Request Log methods
  createRequestLog(log: InsertRequestLog): Promise<RequestLog>;
  getRequestLogsByApiKey(apiKeyId: string, limit?: number): Promise<RequestLog[]>;
  getRequestLogsByUserId(userId: string, limit?: number): Promise<RequestLog[]>;

  // Integration methods
  getIntegrationsByUserId(userId: string): Promise<Integration[]>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, updates: Partial<InsertIntegration>): Promise<Integration | undefined>;
  deleteIntegration(id: string): Promise<boolean>;

  // Analytics methods
  getApiKeyUsageStats(apiKeyId: string, hours: number): Promise<{ count: number; avgResponseTime: number; errorRate: number }>;
  getUserDashboardStats(userId: string): Promise<{
    activeKeys: number;
    totalRequests: number;
    avgResponseTime: number;
    errorRate: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return withDbRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || undefined;
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return withDbRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user || undefined;
    });
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return withDbRetry(async () => {
      const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning();
      return user;
    });
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  // API Key methods
  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return apiKey || undefined;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return apiKey || undefined;
  }

  async getApiKeysByUserId(userId: string): Promise<ApiKey[]> {
    return await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }

  async createApiKey(apiKeyData: InsertApiKey & { keyHash: string; keyPrefix: string }): Promise<ApiKey> {
    const [apiKey] = await db
      .insert(apiKeys)
      .values(apiKeyData)
      .returning();
    return apiKey;
  }

  async updateApiKey(id: string, updates: Partial<InsertApiKey>): Promise<ApiKey | undefined> {
    const [apiKey] = await db
      .update(apiKeys)
      .set(updates)
      .where(eq(apiKeys.id, id))
      .returning();
    return apiKey || undefined;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = await db.delete(apiKeys).where(eq(apiKeys.id, id));
    return result.rowCount > 0;
  }

  // Request Log methods
  async createRequestLog(log: InsertRequestLog): Promise<RequestLog> {
    const [requestLog] = await db
      .insert(requestLogs)
      .values(log)
      .returning();
    return requestLog;
  }

  async getRequestLogsByApiKey(apiKeyId: string, limit: number = 100): Promise<RequestLog[]> {
    return await db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.apiKeyId, apiKeyId))
      .orderBy(desc(requestLogs.timestamp))
      .limit(limit);
  }

  async getRequestLogsByUserId(userId: string, limit: number = 100): Promise<RequestLog[]> {
    return await db
      .select({
        id: requestLogs.id,
        apiKeyId: requestLogs.apiKeyId,
        endpoint: requestLogs.endpoint,
        method: requestLogs.method,
        statusCode: requestLogs.statusCode,
        responseTime: requestLogs.responseTime,
        requestBody: requestLogs.requestBody,
        responseBody: requestLogs.responseBody,
        errorMessage: requestLogs.errorMessage,
        timestamp: requestLogs.timestamp,
      })
      .from(requestLogs)
      .innerJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(requestLogs.timestamp))
      .limit(limit);
  }

  // Integration methods
  async getIntegrationsByUserId(userId: string): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.userId, userId));
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const [newIntegration] = await db
      .insert(integrations)
      .values(integration)
      .returning();
    return newIntegration;
  }

  async updateIntegration(id: string, updates: Partial<InsertIntegration>): Promise<Integration | undefined> {
    const [integration] = await db
      .update(integrations)
      .set(updates)
      .where(eq(integrations.id, id))
      .returning();
    return integration || undefined;
  }

  async deleteIntegration(id: string): Promise<boolean> {
    const result = await db.delete(integrations).where(eq(integrations.id, id));
    return result.rowCount > 0;
  }

  // Analytics methods
  async getApiKeyUsageStats(apiKeyId: string, hours: number): Promise<{ count: number; avgResponseTime: number; errorRate: number }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await db
      .select({
        statusCode: requestLogs.statusCode,
        responseTime: requestLogs.responseTime,
      })
      .from(requestLogs)
      .where(and(
        eq(requestLogs.apiKeyId, apiKeyId),
        gte(requestLogs.timestamp, since)
      ));

    const totalRequests = logs.length;
    const errorRequests = logs.filter(log => log.statusCode >= 400).length;
    const avgResponseTime = logs.length > 0
      ? logs.reduce((sum, log) => sum + (log.responseTime || 0), 0) / logs.length
      : 0;
    const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;

    return {
      count: totalRequests,
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }

  async getUserDashboardStats(userId: string): Promise<{
    activeKeys: number;
    totalRequests: number;
    avgResponseTime: number;
    errorRate: number;
  }> {
    // Get active API keys count
    const [activeKeysResult] = await db
      .select({ count: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)));

    // Get today's request stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = await db
      .select({
        statusCode: requestLogs.statusCode,
        responseTime: requestLogs.responseTime,
      })
      .from(requestLogs)
      .innerJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
      .where(and(
        eq(apiKeys.userId, userId),
        gte(requestLogs.timestamp, today)
      ));

    const totalRequests = todayLogs.length;
    const errorRequests = todayLogs.filter(log => log.statusCode >= 400).length;
    const avgResponseTime = todayLogs.length > 0
      ? todayLogs.reduce((sum, log) => sum + (log.responseTime || 0), 0) / todayLogs.length
      : 0;
    const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;

    return {
      activeKeys: activeKeysResult.count,
      totalRequests,
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }
}

export const storage = new DatabaseStorage();