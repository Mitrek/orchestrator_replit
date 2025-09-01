import { apiKeyAuth } from "../middleware/apiKeyAuth";

export function registerPingRoute(app) {
  app.get("/api/v1/ping", apiKeyAuth, (req, res) => {
    res.json({ ok: true, apiKeyId: req.apiKeyId, userId: req.user?.id });
  });
}
