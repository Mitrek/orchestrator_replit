import type { Express } from "express";

// Phase 9 bootstrap: QA is disabled to avoid build-time coupling with renderer.
// We'll re-enable golden-image checks in a later phase without blocking server startup.
export function registerQa(app: Express) {
  app.get("/api/v1/heatmap/diagnostics/qa", (_req, res) => {
    res.status(200).json({
      qaEnabled: false,
      reason: "QA disabled in Phase 9 bootstrap (goldens not wired)",
      note: "This endpoint exists only to avoid 404s in tooling."
    });
  });
}