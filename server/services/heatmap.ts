
// FILE: server/services/heatmap.ts
import { withPage, screenshotFullPage, screenshotViewport, extractAboveTheFoldDOM } from "../lib/browser";
import { predictHotspots } from "../lib/aiPredictor";
import { renderAboveTheFoldHeatmap, renderDataHeatmap } from "../lib/heatmapRenderer";
import { streamJsonl, segmentByViewport, normalizedToAbsolute, processSessionData, getMaxScroll } from "../lib/dataProcessor";
import { saveImage, cleanupOldFiles } from "../lib/files";
import pino from "pino";

const logger = pino();

export type HeatmapParams = {
  url: string;
  viewport?: { width: number; height: number };
  mode?: "base64" | "url";
};

export type DataHeatmapParams = {
  url: string;
  dataPath: string;
  mode?: "base64" | "url";
  segments?: {
    desktop?: { width: number; height: number };
    tablet?: { width: number; height: number };
    mobile?: { width: number; height: number };
  };
};

export async function generateAI(params: HeatmapParams): Promise<{
  base64?: string;
  url?: string;
  meta: { sourceUrl: string; viewport: { width: number; height: number }; hotspots: number };
}> {
  const { url, viewport = { width: 1440, height: 900 }, mode = "base64" } = params;

  try {
    const result = await withPage(async (page) => {
      // Navigate to the page
      await page.setViewport(viewport);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

      // Extract DOM elements
      const domElements = await extractAboveTheFoldDOM(page);
      logger.info({ elements: domElements.length }, 'Extracted DOM elements');

      // Take viewport screenshot
      const screenshotBuffer = await screenshotViewport(page, viewport.width, viewport.height);

      // Predict hotspots using AI
      const hotspots = await predictHotspots(domElements, viewport);
      logger.info({ hotspots: hotspots.length }, 'Predicted hotspots');

      // Render heatmap
      const heatmapBuffer = await renderAboveTheFoldHeatmap(screenshotBuffer, hotspots);

      return { heatmapBuffer, hotspots };
    });

    // Clean up old files periodically
    cleanupOldFiles().catch(() => {}); // Don't block on cleanup errors

    if (mode === "url") {
      const publicUrl = await saveImage(result.heatmapBuffer, 'ai');
      return {
        url: publicUrl,
        meta: { sourceUrl: url, viewport, hotspots: result.hotspots.length }
      };
    }

    return {
      base64: `data:image/png;base64,${result.heatmapBuffer.toString('base64')}`,
      meta: { sourceUrl: url, viewport, hotspots: result.hotspots.length }
    };
  } catch (error) {
    logger.error({ error: error.message, url }, 'Failed to generate AI heatmap');
    throw error;
  }
}

export async function generateFromData(params: DataHeatmapParams): Promise<{
  segments: {
    desktop?: { url?: string; base64?: string };
    tablet?: { url?: string; base64?: string };
    mobile?: { url?: string; base64?: string };
  };
  meta: { sourceUrl: string; totalSessions: number };
}> {
  const { url, dataPath, mode = "base64", segments: customSegments } = params;

  const defaultSegments = {
    desktop: customSegments?.desktop || { width: 1920, height: 1080 },
    tablet: customSegments?.tablet || { width: 1024, height: 768 },
    mobile: customSegments?.mobile || { width: 414, height: 896 }
  };

  const segmentData = {
    desktop: { points: [], maxScroll: 0 },
    tablet: { points: [], maxScroll: 0 },
    mobile: { points: [], maxScroll: 0 }
  };

  let totalSessions = 0;

  try {
    // Process JSONL data
    for await (const session of streamJsonl(dataPath)) {
      totalSessions++;
      const segment = segmentByViewport(session);
      const points = processSessionData(session);
      const maxScroll = getMaxScroll(session);

      segmentData[segment].points.push(...points);
      segmentData[segment].maxScroll = Math.max(segmentData[segment].maxScroll, maxScroll);
    }

    logger.info({ totalSessions, segments: Object.keys(segmentData).map(k => `${k}: ${segmentData[k].points.length}`) }, 'Processed session data');

    // Generate screenshots and heatmaps for each segment with data
    const results: any = {};

    for (const [segmentName, data] of Object.entries(segmentData)) {
      if (data.points.length === 0) {
        logger.info({ segment: segmentName }, 'Skipping segment with no data');
        continue;
      }

      const viewport = defaultSegments[segmentName];
      
      const result = await withPage(async (page) => {
        await page.setViewport(viewport);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

        const screenshotBuffer = await screenshotFullPage(page);
        const screenshot = await import('@napi-rs/canvas').then(canvas => canvas.loadImage(screenshotBuffer));
        const pageHeight = screenshot.height;

        // Convert normalized coordinates to absolute positions
        const absolutePoints = data.points.map(point => {
          const absolute = normalizedToAbsolute(point, pageHeight, viewport.height, viewport.width);
          return {
            x: absolute.x,
            y: absolute.y,
            confidence: point.type === 'click' ? 1.0 : 0.3
          };
        });

        // Render heatmap
        const heatmapBuffer = await renderDataHeatmap(screenshotBuffer, absolutePoints, viewport, data.maxScroll);
        return heatmapBuffer;
      });

      if (mode === "url") {
        const publicUrl = await saveImage(result, `data_${segmentName}`);
        results[segmentName] = { url: publicUrl };
      } else {
        results[segmentName] = { base64: `data:image/png;base64,${result.toString('base64')}` };
      }

      logger.info({ segment: segmentName, points: data.points.length }, 'Generated heatmap for segment');
    }

    // Clean up old files periodically
    cleanupOldFiles().catch(() => {}); // Don't block on cleanup errors

    return {
      segments: results,
      meta: { sourceUrl: url, totalSessions }
    };
  } catch (error) {
    logger.error({ error: error.message, url }, 'Failed to generate data heatmap');
    throw error;
  }
}
