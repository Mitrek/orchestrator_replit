
import { Request, Response } from "express";
import { metrics } from "./metrics";
import { getCacheStats } from "./services/hotspotsCache";
import { ERROR_TYPES } from "./logger";

// Recent errors storage (ring buffer)
interface RecentError {
  ts: string;
  route: string;
  errType: string;
  errCode: string;
  message: string;
  reqId: string;
}

const recentErrors: RecentError[] = [];
const MAX_RECENT_ERRORS = 50;

export function addRecentError(error: RecentError): void {
  recentErrors.push(error);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.shift();
  }
}

export async function handleDiagnostics(req: Request, res: Response): Promise<void> {
  try {
    const runQA = req.query.qa === "1";
    const routeMetrics = metrics.getMetrics();
    const cacheStats = getCacheStats();

    // Provider health checks
    const screenshotProvider = await checkScreenshotProvider();
    const aiProvider = await checkAIProvider();

    const diagnostics = {
      phase: "phase8",
      uptimeSec: metrics.getUptimeSeconds(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      featureFlags: {
        heatmapEnabled: process.env.HEATMAP_ENABLED !== "false",
        aiHotspotsEnabled: process.env.OPENAI_API_KEY ? true : false
      },
      env: {
        node: process.version,
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        provider: getProviderName(),
        providerConfigured: isProviderConfigured()
      },
      metrics: {
        routes: routeMetrics,
        cache: cacheStats
      },
      providers: {
        screenshot: screenshotProvider,
        ai: aiProvider
      },
      recentErrors: recentErrors.slice(-10), // Last 10 errors
      ...(runQA && { qa: await runGoldenQA() })
    };

    res.json(diagnostics);
  } catch (error: any) {
    console.error("Diagnostics error:", error);
    res.status(500).json({ 
      error: "Failed to generate diagnostics", 
      message: error.message 
    });
  }
}

async function checkScreenshotProvider(): Promise<{ active: boolean; lastError: string | null }> {
  try {
    // Basic check - we could enhance this to ping the provider
    const hasKey = process.env.THUM_IO_KEY || process.env.SCREENSHOT_MACHINE_KEY;
    return {
      active: !!hasKey,
      lastError: hasKey ? null : "No provider API key configured"
    };
  } catch (error: any) {
    return {
      active: false,
      lastError: error.message
    };
  }
}

async function checkAIProvider(): Promise<{ active: boolean; lastError: string | null; lastModel?: string }> {
  try {
    const hasKey = !!process.env.OPENAI_API_KEY;
    return {
      active: hasKey,
      lastError: hasKey ? null : "OpenAI API key not configured",
      lastModel: "gpt-4o-mini"
    };
  } catch (error: any) {
    return {
      active: false,
      lastError: error.message
    };
  }
}

function getProviderName(): string {
  if (process.env.THUM_IO_KEY) return "thumio";
  if (process.env.SCREENSHOT_MACHINE_KEY) return "screenshotmachine";
  return "unknown";
}

function isProviderConfigured(): boolean {
  return !!(process.env.THUM_IO_KEY || process.env.SCREENSHOT_MACHINE_KEY);
}

async function runGoldenQA(): Promise<Array<any>> {
  try {
    const { runGoldenQA: runQA } = await import("./qa");
    const results = await runQA();
    
    // Return array format with all diagnostic fields
    return results.map(result => ({
      device: result.device,
      goldenFound: result.goldenFound,
      goldenSize: result.goldenSize,
      renderSize: result.renderSize,
      mse: result.mse,
      psnr: result.psnr,
      pass: result.pass,
      reason: result.reason
    }));
  } catch (error: any) {
    console.error("QA diagnostics error:", error);
    return [
      { device: "desktop", goldenFound: false, pass: false, reason: "qa_error" },
      { device: "tablet", goldenFound: false, pass: false, reason: "qa_error" },
      { device: "mobile", goldenFound: false, pass: false, reason: "qa_error" }
    ];
  }
}
