// server/routes/apiKeys.ts
import { Router } from "express";
import crypto from "crypto";
// import your DB + schema
// import { db } from "../db";               // <- adjust to your path
// import { apiKeys } from "../db/schema";   // <- adjust to your path
// import { requireAuth } from "../middleware/auth"; // <- if you have it

const router = Router();

function generateApiKey() {
  // Example key: sa_xxx... (52 chars total is fine)
  const raw = "sa_" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const lastFour = raw.slice(-4);
  return { raw, hash, lastFour };
}

/**
 * POST /api/keys
 * Create a new API key and return the plaintext ONCE.
 */
router.post("/api/keys", /*requireAuth,*/ async (req, res) => {
  try {
    // const userId = req.user.id; // from auth middleware
    const userId = req.body.userId ?? null; // <-- replace with your auth source

    const { raw, hash, lastFour } = generateApiKey();

    // Persist ONLY the hash
    // await db.insert(apiKeys).values({
    //   userId,
    //   hash,
    //   lastFour,
    //   createdAt: new Date(),
    //   active: true,
    // });

    // If you need to return metadata to list in the UI, you can include it here.
    return res.status(201).json({
      apiKey: raw,         // plaintext shown ONCE
      lastFour,            // helpful to show in list later
      message: "API key created. You will not be able to see it again.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create API key" });
  }
});

export default router;
