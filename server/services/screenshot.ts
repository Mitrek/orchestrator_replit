// FILE: server/services/screenshot.ts
import { getExternalScreenshotBase64 } from "./screenshotExternal";

type Device = "desktop" | "tablet" | "mobile";

const VIEWPORTS: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1920, height: 1080 },
  tablet:  { width: 1024, height: 768 },
  mobile:  { width: 414,  height: 896 },
};

export class ScreenshotError extends Error {
  code: "PROVIDER_FAILED" | "UNKNOWN";
  constructor(code: ScreenshotError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function getScreenshotBuffer(
  url: string,
  device: Device
): Promise<{ png: Buffer; viewport: { width: number; height: number } }> {
  const viewport = VIEWPORTS[device] ?? VIEWPORTS.desktop;

  try {
    const { image /* data URI */, provider } =
      await getExternalScreenshotBase64(url, device);

    const b64 = image.replace(/^data:image\/png;base64,/, "");
    const png = Buffer.from(b64, "base64");

    // Tiny sanity check
    if (!png || png.length < 1000) {
      throw new ScreenshotError("PROVIDER_FAILED", `Empty/invalid PNG from provider: ${provider}`);
    }

    return { png, viewport };
  } catch (e: any) {
    if (e instanceof ScreenshotError) throw e;
    throw new ScreenshotError("UNKNOWN", String(e?.message ?? e));
  }
}

export async function screenshotToBase64(opts: {
  url: string;
  device?: Device;
  fullPage?: boolean;
}): Promise<string> {
  const { url, device = "desktop" } = opts;

  try {
    const { image } = await getExternalScreenshotBase64(url, device);
    return image;
  } catch (e: any) {
    throw new ScreenshotError("PROVIDER_FAILED", `Failed to get screenshot: ${e?.message ?? e}`);
  }
}