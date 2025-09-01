import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";                 // your Drizzle db instance
import { apiKeys } from "@shared/schema";   // your Drizzle table schema
import { eq } from "drizzle-orm";

const HASH_ONLY_SECRET = false; // set to false if you hashed the full key

function parseApiKey(raw: string | undefined) {
  const trimmed = (raw || "").trim();
  const m = /^([a-z]+_[a-z]+_[a-f0-9]{8})_([A-Za-z0-9_-]{16,})$/.exec(trimmed);
  if (!m) return null;
  const [, prefix, secret] = m;
  return { prefix, secret, full: trimmed };
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const rawKey = req.header("x-api-key");
    const parsed = parseApiKey(rawKey);
    if (!parsed) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    const { prefix, secret, full } = parsed;

    // Drizzle query
    const row = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyPrefix, prefix),
      columns: {
        id: true,
        keyHash: true,
        isActive: true,
      },
    });

    if (!row || !row.isActive) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    // Compare with correct part (secret or full key)
    const plaintext = HASH_ONLY_SECRET ? secret : full;
    const ok = await bcrypt.compare(plaintext, row.keyHash);

    if (!ok) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    // Attach for later use
    (req as any).apiKeyId = row.id;
    next();
  } catch (e: any) {
    console.error("apiKeyAuth error:", e?.message || e);
    console.error(e?.stack || "");
    return res.status(500).json({ message: "Auth middleware error" });
  }
}
