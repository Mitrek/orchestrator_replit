import bcrypt from "bcryptjs";
import { db } from "../db";                 // ← adjust if your drizzle client path differs
import { apiKeys, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// If you used bcrypt.hash(secret) at creation time, keep this TRUE.
// If you used bcrypt.hash(fullKey) at creation time, set this to FALSE.
const HASH_ONLY_SECRET = true;

function parseApiKey(raw: string) {
  const trimmed = (raw || "").trim();

  // ai_lure_ + 8 hex, underscore, then a secret with URL-safe chars
  const m = /^([a-z]+_[a-z]+_[a-f0-9]{8})_([A-Za-z0-9_-]{16,})$/.exec(trimmed);
  if (!m) return null;

  const [, prefix, secret] = m;
  return { prefix, secret, full: trimmed };
}

export async function apiKeyAuth(req, res, next) {
  try {
    const rawKey = req.header("x-api-key");
    const parsed = parseApiKey(rawKey);
    if (!parsed) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    const { prefix, secret, full } = parsed;

    // Look up by prefix
    const row = await db.oneOrNone(
      "SELECT id, key_hash, is_active FROM api_keys WHERE key_prefix = $1",
      [prefix]
    );

    if (!row || !row.is_active) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    // Compare consistently with how you hashed at creation
    const plaintextForCompare = HASH_ONLY_SECRET ? secret : full;
    const ok = await bcrypt.compare(plaintextForCompare, row.key_hash);

    if (!ok) {
      return res.status(403).json({ message: "Invalid or inactive key" });
    }

    // Optionally attach key id/user context to req for rate limiting
    req.apiKeyId = row.id;
    return next();
  } catch (e: any) {
    console.error("apiKeyAuth error:", e?.message || e);
    console.error(e?.stack || "");
    return res.status(500).json({ message: "Auth middleware error" });
  }
}



