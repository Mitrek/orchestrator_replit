// FILE: server/services/screenshot.ts
import puppeteer from "puppeteer";

type Device = "desktop" | "tablet" | "mobile";

const VIEWPORTS: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1920, height: 1080 },
  tablet:  { width: 1024, height: 768  },
  mobile:  { width: 414,  height: 896  },
};

export async function screenshotToBase64(opts: {
  url: string;
  device?: Device;
  fullPage?: boolean;
}): Promise<string> {
  const device = (opts.device ?? "desktop") as Device;
  const vp = VIEWPORTS[device];

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-web-security",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.goto(opts.url, { waitUntil: "networkidle2", timeout: 30_000 });

    const buf = (await page.screenshot({
      type: "png",
      fullPage: Boolean(opts.fullPage),
    })) as Buffer;

    return `data:image/png;base64,${buf.toString("base64")}`;
  } finally {
    await browser.close();
  }
}