
import fetch from "node-fetch";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<Device, number> = {
  desktop: 1920,
  tablet: 1024,
  mobile: 414,
};

export async function screenshotToBase64(opts: {
  url: string;
  device?: Device;
  fullPage?: boolean;
}): Promise<string> {
  const device = opts.device || "desktop";
  const width = DEVICE_WIDTHS[device];
  
  const thumUrl = `https://image.thum.io/get/png/width/${width}/${encodeURIComponent(opts.url)}`;
  
  try {
    const response = await fetch(thumUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Screenshot Service)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = await response.buffer();
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error: any) {
    throw new Error(`SCREENSHOT_PROVIDER_FAILED: ${error.message}`);
  }
}
