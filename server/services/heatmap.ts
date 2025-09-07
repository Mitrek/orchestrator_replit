// FILE: server/services/heatmap.ts
export type HeatmapParams = {
  url: string;
  viewport?: { width: number; height: number };
  mode?: "base64" | "url";
};

export async function generateHeatmap(params: HeatmapParams): Promise<{
  base64?: string;
  url?: string;
  meta: { sourceUrl: string; viewport?: { width: number; height: number } };
}> {
  const { url, viewport, mode = "base64" } = params;

  // STUB: 1×1 PNG so your end-to-end works today.
  const tinyPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ea8ZbsAAAAASUVORK5CYII=";

  if (mode === "url") {
    // Later: upload to storage and return the public URL.
    return {
      url: `data:image/png;base64,${tinyPngBase64}`,
      meta: { sourceUrl: url, viewport },
    };
  }

  return {
    base64: `data:image/png;base64,${tinyPngBase64}`,
    meta: { sourceUrl: url, viewport },
  };
}
