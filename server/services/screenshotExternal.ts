
// Use built-in fetch (Node 18+) or node-fetch
const fetch = globalThis.fetch || require("node-fetch");

// tiny built-in 1x1 placeholder so UI doesn't break if all providers fail
function dummyPng(): string {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4//8/AwAI/AL+XUuV1wAAAABJRU5ErkJggg==";
  return `data:image/png;base64,${base64}`;
}

// Fetch helper (no extra deps)
async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} – ${text?.slice(0, 200)}`,
    );
  }
  return await res.arrayBuffer();
}

// Provider A: Thum.io (expects raw URL in path, not encoded)
async function thumIo(url: string, width = 1440): Promise<string> {
  const api = `https://image.thum.io/get/png/width/${width}/${url}?cb=${Date.now()}`;
  const res = await fetch(api, { headers: { "User-Agent": "HeatmapBot/1.0" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} – ${text.slice(0, 200)}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Provider B: ScreenshotMachine (free demo key "free" works for small tests but watermarked)
async function screenshotMachine(url: string, width = 1440): Promise<string> {
  const key = process.env.SCREENSHOTMACHINE_KEY || "free";
  const api = `https://api.screenshotmachine.com/?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}&dimension=${width}xfull&format=png`;
  const buf = Buffer.from(await fetchArrayBuffer(api));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

type ProviderResult =
  | { ok: true; image: string; provider: string }
  | { ok: false; provider: string; error: string };

async function tryProviders(url: string): Promise<ProviderResult> {
  // Try Thum.io first
  try {
    const image = await thumIo(url);
    return { ok: true, image, provider: "thum.io" };
  } catch (e: any) {
    // continue
  }

  // Then ScreenshotMachine
  try {
    const image = await screenshotMachine(url);
    return { ok: true, image, provider: "screenshotmachine" };
  } catch (e: any) {
    return { ok: false, provider: "all", error: String(e?.message ?? e) };
  }
}

export async function getExternalScreenshotBase64(
  url: string, 
  device: "desktop" | "tablet" | "mobile" = "desktop"
): Promise<{ image: string; provider: string }> {
  const p = await tryProviders(url);
  
  if (p.ok) {
    return { image: p.image, provider: p.provider };
  }

  // Last resort: return dummy
  return { image: dummyPng(), provider: "none" };
}
