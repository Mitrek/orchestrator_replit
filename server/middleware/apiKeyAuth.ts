import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { apiKeys } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

/**
 * If your DB stores a bcrypt hash of the FULL key (prefix + '_' + secret),
 * keep HASH_ONLY_SECRET = false (recommended).
 *
 * If your DB stores a bcrypt hash of ONLY the secret portion, set it to true.
 */
const HASH_ONLY_SECRET = false;

function parseApiKey(raw: string | undefined) {
  const trimmed = (raw || "").trim();
  // ai_lure_<8-hex>_<url-safe-secret>
  const m = /^([a-z]+_[a-z]+_[a-f0-9]{8})_([A-Za-z0-9_-]{16,})$/.exec(trimmed);
  if (!m) return null;
  const [, prefix, secret] = m;
  return { prefix, secret, full: trimmed };
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Accept both: X-API-Key and Authorization: Bearer <key>
    const headerKey = req.header("x-api-key") || req.header("X-API-Key");
    let rawKey = headerKey;
    if (!rawKey) {
      const auth = req.header("authorization") || req.header("Authorization");
      if (auth && auth.startsWith("Bearer ")) rawKey = auth.slice(7);
    }

    const parsed = parseApiKey(rawKey);
    if (!parsed) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Look up by prefix; compare bcrypt with stored hash
    const [row] = await db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        keyHash: apiKeys.keyHash,
        keyPrefix: apiKeys.keyPrefix,
        isActive: apiKeys.isActive,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyPrefix, parsed.prefix))
      .limit(1);

    if (!row || !row.isActive) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    const candidate = HASH_ONLY_SECRET ? parsed.secret : parsed.full;
    const ok = await bcrypt.compare(candidate, row.keyHash);
    if (!ok) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    // Attach for downstream routes
    (req as any).apiKeyId = row.id;
    (req as any).userId = row.userId;         // ⬅️ IMPORTANT
    (req as any).apiKeyPrefix = row.keyPrefix;

    next();
  } catch (e: any) {
    console.error("apiKeyAuth error:", e?.message || e);
    return res.status(500).json({ message: "Auth middleware error" });
  }
}
