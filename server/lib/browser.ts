
import puppeteer, { Browser, Page } from "puppeteer";
import pino from "pino";

const logger = pino();
let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser && (await browser.process())?.pid) return browser;
  
  browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });
  
  logger.info("Browser launched successfully");
  return browser;
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    page.setDefaultNavigationTimeout(120_000);
    page.setDefaultTimeout(120_000);
    return await fn(page);
  } finally {
    await page.close();
  }
}

export async function screenshotFullPage(page: Page): Promise<Buffer> {
  return await page.screenshot({ type: "png", fullPage: true });
}

export async function screenshotViewport(page: Page, width: number, height: number): Promise<Buffer> {
  await page.setViewport({ width, height });
  return await page.screenshot({ type: "png" });
}

export async function extractAboveTheFoldDOM(page: Page) {
  // Hide cookie banners and noise without removing elements
  await page.addStyleTag({
    content: `
      [class*="cookie"], [id*="cookie"],
      [class*="banner"], [id*="banner"],
      [class*="popup"], [id*="popup"],
      [class*="modal"], [id*="modal"],
      [class*="overlay"], [id*="overlay"],
      [class*="notification"], [id*="notification"],
      [role="dialog"], [role="alert"],
      [class*="gdpr"], [class*="consent"] {
        display: none !important;
      }
    `
  });

  return await page.evaluate(() => {
    const elements: any[] = [];
    const selectors = [
      'h1', 'h2', 'h3', 'p', 'button', 'a[href]', 'img', 'video', 'svg',
      '[class*="logo"]', '[id*="logo"]', '[class*="hero"]', '[class*="banner"]',
      '[class*="cta"]', '[class*="button"]', '.price', '[class*="price"]',
      '[class*="product"]', '[class*="feature"]'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(el);
        
        if (rect.width < 10 || rect.height < 10 || 
            computedStyle.display === 'none' || 
            computedStyle.visibility === 'hidden' || 
            parseFloat(computedStyle.opacity) < 0.1) return;

        elements.push({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 150) || '',
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          className: el.className || '',
          id: el.id || '',
          zIndex: parseInt(computedStyle.zIndex) || 0,
          fontSize: parseFloat(computedStyle.fontSize) || 0,
          fontWeight: computedStyle.fontWeight || 'normal',
        });
      });
    });

    return elements;
  });
}
