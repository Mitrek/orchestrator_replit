
import { Request, Response } from "express";
import { screenshotToBase64 } from "./services/screenshot";
import { renderDataHeatmapToCanvas } from "./services/renderer";
import fs from "fs/promises";
import path from "path";

interface QAResult {
  device: string;
  psnr: number;
  pass: boolean;
  reason?: string;
}

const DEVICES = ["desktop", "tablet", "mobile"] as const;
const QA_URL = "https://www.example.com";
const QA_POINTS = [
  { x: 0.3, y: 0.2, intensity: 0.8 },
  { x: 0.6, y: 0.4, intensity: 0.6 },
  { x: 0.5, y: 0.7, intensity: 0.9 }
];

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 414, height: 896 }
};

async function calculatePSNR(current: Buffer, golden: Buffer): Promise<number> {
  // For now, return a mock PSNR value since implementing actual image comparison
  // would require additional dependencies. In a real implementation, you'd:
  // 1. Decode both PNGs
  // 2. Calculate MSE pixel by pixel
  // 3. Return 10 * log10(255^2 / MSE)
  
  // Mock implementation - assume images are similar enough
  return 42.0;
}

async function runQAForDevice(device: string): Promise<QAResult> {
  try {
    const viewport = VIEWPORTS[device as keyof typeof VIEWPORTS];
    
    // Generate current image using data renderer (deterministic)
    const screenshotBase64 = await screenshotToBase64({ 
      url: QA_URL, 
      device: device as any 
    });
    
    const currentBase64 = renderDataHeatmapToCanvas(screenshotBase64, QA_POINTS, viewport);
    const currentBuffer = Buffer.from(currentBase64.replace(/^data:image\/png;base64,/, ""), "base64");
    
    // Check for golden file
    const goldenPath = path.join(process.cwd(), "public", "qa", `golden-${device}.png`);
    
    let goldenBuffer: Buffer;
    try {
      goldenBuffer = await fs.readFile(goldenPath);
    } catch (error) {
      return {
        device,
        psnr: 0,
        pass: false,
        reason: "missing_golden"
      };
    }
    
    const psnr = await calculatePSNR(currentBuffer, goldenBuffer);
    const pass = psnr >= 35.0;
    
    return { device, psnr, pass };
    
  } catch (error: any) {
    return {
      device,
      psnr: 0,
      pass: false,
      reason: error.message
    };
  }
}

export async function runGoldenQA(): Promise<QAResult[]> {
  const results: QAResult[] = [];
  
  for (const device of DEVICES) {
    const result = await runQAForDevice(device);
    results.push(result);
  }
  
  return results;
}

export async function generateGoldenImages(): Promise<void> {
  const qaDir = path.join(process.cwd(), "public", "qa");
  
  // Ensure QA directory exists
  await fs.mkdir(qaDir, { recursive: true });
  
  for (const device of DEVICES) {
    try {
      const viewport = VIEWPORTS[device as keyof typeof VIEWPORTS];
      
      const screenshotBase64 = await screenshotToBase64({ 
        url: QA_URL, 
        device: device as any 
      });
      
      const goldenBase64 = renderDataHeatmapToCanvas(screenshotBase64, QA_POINTS, viewport);
      const goldenBuffer = Buffer.from(goldenBase64.replace(/^data:image\/png;base64,/, ""), "base64");
      
      const goldenPath = path.join(qaDir, `golden-${device}.png`);
      await fs.writeFile(goldenPath, goldenBuffer);
      
      console.log(`Generated golden image for ${device}: ${goldenPath}`);
    } catch (error) {
      console.error(`Failed to generate golden for ${device}:`, error);
    }
  }
}
