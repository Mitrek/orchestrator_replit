import bcrypt from "bcryptjs";
import { db } from "../db";                 // ← adjust if your drizzle client path differs
import { apiKeys, users } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function apiKeyAuth(req, res, next) {
  const raw = req.get("x-api-key");
  if (!raw) return res.status(401).json({ message: "Missing x-api-key" });

  const parts = raw.split("_");
  if (parts.length < 3) return res.status(401).json({ message: "Invalid key format" });
  const keyPrefix = parts[2]; // e.g., ai_lure_<prefix>_<body>

  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, keyPrefix)).limit(1);
  if (!key || !key.isActive) return res.status(403).json({ message: "Invalid or inactive key" });

  const ok = await bcrypt.compare(raw, key.keyHash);
  if (!ok) return res.status(403).json({ message: "Invalid key" });

  // fire-and-forget update
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(()=>{});

  const [owner] = await db.select().from(users).where(eq(users.id, key.userId)).limit(1);
  req.apiKey = key;
  req.user = owner;
  next();
}
