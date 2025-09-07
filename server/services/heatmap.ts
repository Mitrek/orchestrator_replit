
import HeatmapGenerator from './heatmapGenerator.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  try {
    // Create heatmaps directory if it doesn't exist
    const heatmapsDir = path.join(process.cwd(), 'public', 'heatmaps');
    fs.mkdirSync(heatmapsDir, { recursive: true });

    const generator = new HeatmapGenerator();
    const timestamp = Date.now();
    const filename = `heatmap-${timestamp}.png`;
    const outputPath = path.join(heatmapsDir, filename);

    // Generate AI heatmap
    await generator.generateAiHeatmap(url, outputPath);

    if (mode === "url") {
      // Return the public URL path
      return {
        url: `/heatmaps/${filename}`,
        meta: { sourceUrl: url, viewport },
      };
    }

    // Convert to base64
    const imageBuffer = fs.readFileSync(outputPath);
    const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    
    // Clean up file after converting to base64
    fs.unlinkSync(outputPath);

    return {
      base64,
      meta: { sourceUrl: url, viewport },
    };
  } catch (error) {
    console.error('Heatmap generation failed:', error);
    
    // Fallback: return a tiny placeholder PNG
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ea8ZbsAAAAASUVORK5CYII=";

    if (mode === "url") {
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
}
