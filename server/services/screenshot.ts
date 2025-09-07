// FILE: server/services/screenshot.ts
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

type Device = "desktop" | "tablet" | "mobile";

const VIEWPORTS: Record<
  Device,
  {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
  }
> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  tablet: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: true },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true }, // iPhone-ish
};

export class ScreenshotError extends Error {
  code:
    | "LAUNCH_FAILED"
    | "NAVIGATION_TIMEOUT"
    | "NAVIGATION_FAILED"
    | "SCREENSHOT_FAILED"
    | "UNKNOWN";
  constructor(code: ScreenshotError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function screenshotToBase64(opts: {
  url: string;
  device?: Device;
  fullPage?: boolean;
}): Promise<string> {
  const { url, device = "desktop", fullPage = false } = opts;
  const viewport = VIEWPORTS[device] ?? VIEWPORTS.desktop;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      executablePath,
      headless: chromium.headless, // true on Replit/serverless
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ],
      defaultViewport: chromium.defaultViewport, // safe baseline
    });
  } catch (e: any) {
    throw new ScreenshotError(
      "LAUNCH_FAILED",
      `Chromium failed to launch: ${e?.message ?? e}`,
    );
  }

  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
    } catch (e: any) {
      if (String(e?.name).includes("TimeoutError")) {
        throw new ScreenshotError(
          "NAVIGATION_TIMEOUT",
          `Navigation timed out after 30s for ${url}`,
        );
      }
      throw new ScreenshotError(
        "NAVIGATION_FAILED",
        `Failed to navigate to ${url}: ${e?.message ?? e}`,
      );
    }

    await page.waitForTimeout(500); // small settle for dynamic pages

    let buf: Buffer;
    try {
      buf = (await page.screenshot({ type: "png", fullPage })) as Buffer;
    } catch (e: any) {
      throw new ScreenshotError(
        "SCREENSHOT_FAILED",
        `Failed to capture screenshot: ${e?.message ?? e}`,
      );
    }

    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (e: any) {
    if (e instanceof ScreenshotError) throw e;
    throw new ScreenshotError(
      "UNKNOWN",
      `Unexpected error: ${e?.message ?? e}`,
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}
