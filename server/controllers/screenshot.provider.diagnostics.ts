
import type { Request, Response } from "express";
import { screenshotToBase64 } from "../services/screenshot";

export async function diagScreenshotProvider(req: Request, res: Response) {
  try {
    const url = (req.query.url as string) || "https://example.com";
    const device = (req.query.device as any) || "desktop";
    const image = await screenshotToBase64({ url, device });
    res.json({
      ok: true,
      provider: "thum.io",
      url,
      device,
      samplePrefix: image.substring(0, 32),
      length: image.length
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, provider: "thum.io", error: err?.message });
  }
}
