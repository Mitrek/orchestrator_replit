
import type { Express, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { ensurePremium } from "../middleware/ensurePremium";
import { generateAI, generateFromData } from "../services/heatmap";
import { AIRequestSchema, DataRequestSchema } from "../lib/validate";
import pino from "pino";

const logger = pino();
const upload = multer({ dest: "uploads/" });

export function registerHeatmapRoutes(app: Express) {
  // AI Mode - Generate heatmap using AI analysis
  app.post("/api/v1/heatmap/ai", apiKeyAuth, ensurePremium, async (req: Request, res: Response) => {
    try {
      const validatedData = AIRequestSchema.parse(req.body);
      
      logger.info({ url: validatedData.url, mode: 'ai' }, 'Starting AI heatmap generation');
      
      const result = await generateAI({
        url: validatedData.url,
        viewport: validatedData.viewport || { width: 1440, height: 900 },
        mode: validatedData.return
      });
      
      logger.info({ mode: validatedData.return }, 'AI heatmap generated successfully');
      res.json(result);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate AI heatmap');
      res.status(400).json({ error: error.message });
    }
  });

  // Data Mode - Generate heatmap from user data
  app.post("/api/v1/heatmap/data", apiKeyAuth, ensurePremium, upload.single("file"), async (req: any, res: Response) => {
    try {
      let validatedData: any;
      let dataPath: string | undefined;

      if (req.file) {
        // Handle multipart upload
        dataPath = req.file.path;
        validatedData = {
          url: req.body.url,
          return: req.body.return || 'base64',
          segments: req.body.segments ? JSON.parse(req.body.segments) : undefined
        };
      } else {
        // Handle JSON request with dataUrl
        validatedData = DataRequestSchema.parse(req.body);
        
        if ('dataUrl' in req.body && req.body.dataUrl) {
          const dataUrl: string = req.body.dataUrl;
          const tmpPath = `uploads/data_${Date.now()}.jsonl`;
          const resp = await fetch(dataUrl);
          if (!resp.ok) throw new Error(`Failed to download dataUrl, status ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());
          await fs.promises.writeFile(tmpPath, buf);
          dataPath = tmpPath;
        }
      }

      if (!dataPath) {
        return res.status(400).json({ error: 'No data file provided' });
      }

      logger.info({ url: validatedData.url, mode: 'data' }, 'Starting data heatmap generation');
      
      const result = await generateFromData({
        url: validatedData.url,
        dataPath,
        mode: validatedData.return,
        segments: validatedData.segments
      });
      
      logger.info({ segments: Object.keys(result.segments || {}) }, 'Data heatmap generated successfully');
      res.json(result);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate data heatmap');
      res.status(400).json({ error: error.message });
    }
  });
}
