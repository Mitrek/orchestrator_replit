// server/middleware/ensurePremium.ts
import type { Request, Response, NextFunction } from "express";
import { isPremiumUser } from "../utils/plan";

export async function ensurePremium(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthenticated" });

    const premium = await isPremiumUser(userId);
    if (!premium) return res.status(403).json({ error: "Premium plan required" });

    next();
  } catch (e) {
    console.error("ensurePremium error:", e);
    return res.status(500).json({ error: "Internal error validating plan" });
  }
}
