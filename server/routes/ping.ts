import { apiKeyAuth } from "../middleware/apiKeyAuth";
import type { Express, Request, Response } from "express";

export function registerPingRoute(app: Express) {
  app.get("/api/v1/ping", apiKeyAuth, (req: Request, res: Response) => {
    res.json({ ok: true });
  });
}
