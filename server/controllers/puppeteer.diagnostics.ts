import type { Request, Response } from "express";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export async function diagPuppeteerLaunch(_req: Request, res: Response) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      executablePath,
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
    });
    await browser.close();
    return res.json({ ok: true, launched: true });
  } catch (e: any) {
    try { if (browser) await browser.close(); } catch {}
    return res.status(500).json({
      ok: false,
      launched: false,
      name: e?.name,
      message: e?.message,
    });
  }
}
