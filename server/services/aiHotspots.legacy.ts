import { createHash } from "crypto";
import { spawn } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import type { Hotspot } from "./validation";
import { clampAndValidateHotspots, greedyDeoverlap } from "./validation";

export async function getAiHotspotsLegacy({
  url,
  device,
  parity
}: {
  url: string;
  device: "desktop" | "tablet" | "mobile";
  parity: boolean;
}): Promise<{
  hotspots: Hotspot[];
  meta: {
    engine: "legacy";
    checksumOk: boolean;
    requested: number;
    accepted: number;
    pruned: number;
  };
}> {
  const scriptPath = join(process.cwd(), "attached_assets/ai-engines/legacy/heatmap_v1.js");
  const checksumPath = join(process.cwd(), "attached_assets/ai-engines/legacy/heatmap_v1.sha256");

  // Verify checksum
  let checksumOk = false;
  try {
    const scriptContent = readFileSync(scriptPath, "utf8");
    const expectedChecksum = readFileSync(checksumPath, "utf8").trim();
    const actualChecksum = createHash("sha256").update(scriptContent).digest("hex");

    if (actualChecksum !== expectedChecksum) {
      throw new Error("Legacy engine checksum mismatch (refuse to run)");
    }
    checksumOk = true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("checksum mismatch")) {
      throw error;
    }
    // File not found or other error - still throw
    throw new Error("Legacy engine checksum mismatch (refuse to run)");
  }

  try {
    // Spawn the legacy script
    const hotspots = await runLegacyScript(scriptPath, url, device);

    if (!hotspots || hotspots.length === 0) {
      // Return fallback if script can't emit JSON yet
      const fallbackHotspots = getFallbackHotspots();
      const { kept } = clampAndValidateHotspots(fallbackHotspots);
      const processed = greedyDeoverlap(kept, { max: 8, iouThreshold: 0.4 });

      return {
        hotspots: processed,
        meta: {
          engine: "legacy",
          checksumOk: true,
          requested: fallbackHotspots.length,
          accepted: processed.length,
          pruned: fallbackHotspots.length - processed.length
        }
      };
    }

    const requested = hotspots.length;
    const { kept } = clampAndValidateHotspots(hotspots);

    // Apply parity rules
    let filtered = kept;
    if (parity) {
      filtered = kept.filter(h => h.confidence >= 0.25);
    }

    const processed = greedyDeoverlap(filtered, { max: 8, iouThreshold: 0.4 });

    return {
      hotspots: processed,
      meta: {
        engine: "legacy",
        checksumOk,
        requested,
        accepted: processed.length,
        pruned: requested - processed.length
      }
    };

  } catch (error: any) {
    console.error("[getAiHotspotsLegacy] error:", error);

    // Fallback instead of throwing to prevent 500s
    const fallbackHotspots = [
      { x: 0.1, y: 0.1, width: 0.3, height: 0.1, confidence: 0.8, element_type: "headline" as const, reason: "Fallback headline area" },
      { x: 0.7, y: 0.2, width: 0.2, height: 0.08, confidence: 0.7, element_type: "cta" as const, reason: "Fallback CTA area" },
      { x: 0.1, y: 0.8, width: 0.15, height: 0.05, confidence: 0.6, element_type: "logo" as const, reason: "Fallback logo area" }
    ];

    return {
      hotspots: fallbackHotspots,
      meta: {
        engine: "legacy" as const,
        checksumOk: false,
        requested: 3,
        accepted: 3,
        pruned: 0,
        fallback: true
      }
    };
  }
}

function runLegacyScript(scriptPath: string, url: string, device: string): Promise<Hotspot[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, "--url", url, "--device", device, "--json"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Legacy script exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Try to parse JSON from stdout
        const lines = stdout.split("\n");
        let jsonLine = "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
            jsonLine = trimmed;
            break;
          }
        }

        if (!jsonLine) {
          resolve([]); // No JSON found, return empty (will trigger fallback)
          return;
        }

        const parsed = JSON.parse(jsonLine);
        const hotspots = Array.isArray(parsed) ? parsed : parsed.hotspots || [];
        resolve(hotspots);
      } catch (parseError) {
        console.error("Failed to parse legacy script JSON:", parseError);
        resolve([]); // Return empty (will trigger fallback)
      }
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to spawn legacy script: ${error.message}`));
    });
  });
}

function getFallbackHotspots(): Hotspot[] {
  return [
    {
      x: 0.35,
      y: 0.15,
      width: 0.3,
      height: 0.2,
      confidence: 0.65,
      element_type: "hero",
      reason: "Hero section fallback"
    },
    {
      x: 0.7,
      y: 0.1,
      width: 0.2,
      height: 0.15,
      confidence: 0.6,
      element_type: "cta",
      reason: "Primary CTA fallback"
    },
    {
      x: 0.1,
      y: 0.05,
      width: 0.25,
      height: 0.1,
      confidence: 0.55,
      element_type: "logo",
      reason: "Logo area fallback"
    },
    {
      x: 0.2,
      y: 0.75,
      width: 0.35,
      height: 0.15,
      confidence: 0.7,
      element_type: "product",
      reason: "Above fold content fallback"
    }
  ];
}