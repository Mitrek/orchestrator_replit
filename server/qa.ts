
import { Request, Response } from "express";
import { 
  renderDeterministicQA, 
  getViewportForDevice, 
  computePSNR, 
  savePng 
} from "./services/renderer";
import fs from "fs/promises";
import path from "path";

interface QAResult {
  device: string;
  goldenFound: boolean;
  goldenSize?: { width: number; height: number };
  renderSize?: { width: number; height: number };
  mse?: number;
  psnr?: number;
  pass: boolean;
  reason?: string;
}

const DEVICES = ["desktop", "tablet", "mobile"] as const;
const QA_URL = "https://www.example.com";

async function runQAForDevice(device: string): Promise<QAResult> {
  try {
    const viewport = getViewportForDevice(device as any);
    
    // Check for golden file first - use robust path resolution
    const goldenPath = path.resolve(import.meta.dirname, "..", "public", "qa", `golden-${device}.png`);
    
    let goldenBuffer: Buffer;
    try {
      goldenBuffer = await fs.readFile(goldenPath);
    } catch (error) {
      return {
        device,
        goldenFound: false,
        pass: false,
        reason: "missing_golden"
      };
    }

    // Generate current deterministic render
    const { png: currentBuffer, width, height } = await renderDeterministicQA(QA_URL, device as any);
    
    // Check dimensions match
    const goldenSize = { width: viewport.width, height: viewport.height }; // Expected golden size
    const renderSize = { width, height };
    
    if (width !== viewport.width || height !== viewport.height) {
      return {
        device,
        goldenFound: true,
        goldenSize,
        renderSize,
        pass: false,
        reason: "dimension_mismatch"
      };
    }
    
    // Compute PSNR
    const { mse, psnr } = computePSNR(currentBuffer, goldenBuffer, width, height);
    
    // Handle NaN PSNR case
    if (isNaN(psnr) || !isFinite(psnr)) {
      return {
        device,
        goldenFound: true,
        goldenSize,
        renderSize,
        mse,
        psnr: 0,
        pass: false,
        reason: "psnr_nan"
      };
    }
    
    const pass = psnr >= 35.0;
    
    return { 
      device, 
      goldenFound: true,
      goldenSize,
      renderSize,
      mse, 
      psnr, 
      pass 
    };
    
  } catch (error: any) {
    return {
      device,
      goldenFound: false,
      pass: false,
      reason: error.message.includes("Missing QA base fixture") ? "missing_base_fixture" : "render_failed"
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

export async function generateGoldenImages(): Promise<Array<{ device: string; success: boolean; size?: { width: number; height: number }; error?: string }>> {
  // Use robust path resolution
  const qaDir = path.resolve(import.meta.dirname, "..", "public", "qa");
  
  // Ensure QA directory exists
  await fs.mkdir(qaDir, { recursive: true });
  
  const results: Array<{ device: string; success: boolean; size?: { width: number; height: number }; error?: string }> = [];
  
  for (const device of DEVICES) {
    try {
      const { png: goldenBuffer, width, height } = await renderDeterministicQA(QA_URL, device);
      
      const goldenPath = path.join(qaDir, `golden-${device}.png`);
      await fs.writeFile(goldenPath, goldenBuffer);
      
      results.push({ 
        device, 
        success: true, 
        size: { width, height } 
      });
      
      console.log(`Generated golden image for ${device}: ${goldenPath} (${width}x${height})`);
    } catch (error: any) {
      console.error(`Failed to generate golden for ${device}:`, error);
      results.push({ 
        device, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  return results;
}
