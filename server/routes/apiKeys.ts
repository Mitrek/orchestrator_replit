import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { apiKeys } from "../db/schema";

function genKey(prefix = "ai_lure") {
  const keyPrefix = crypto.randomBytes(4).toString("hex");     // 8 chars
  const body = crypto.randomBytes(24).toString("base64url");   // ~32 url-safe
  const raw = `${prefix}_${keyPrefix}_${body}`;
  return { keyPrefix, raw, displayPrefix: `${prefix}_${keyPrefix}` };
}

export function registerApiKeyRoutes(app) {
  // POST /api/v1/keys — create and return FULL key ONCE
  app.post("/api/v1/keys", async (req, res) => {
    // If you already have auth/session, get userId from there:
    const userId = req.user?.id || req.body.userId; // TEMP: adapt to your auth
    if (!userId) return res.status(401).json({ message: "No userId" });

    const { name = "default" } = req.body ?? {};
    const { keyPrefix, raw, displayPrefix } = genKey("ai_lure");
    const keyHash = await bcrypt.hash(raw, 12);

    const [row] = await db.insert(apiKeys).values({
      userId,
      name,
      keyHash,
      keyPrefix,
      isActive: true,
    }).returning();

    res.status(201).json({
      id: row.id,
      name: row.name,
      key: raw,                 // <-- show once
      keyPrefix: displayPrefix, // e.g. ai_lure_391877ec
    });
  });
}
