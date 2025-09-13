
import { createHash } from "crypto";
import type { Hotspot } from "./validation";
import { clampAndValidateHotspots, greedyDeoverlap } from "./validation";

export async function getAiHotspotsPhase7({
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
    engine: "phase7";
    model: "gpt-4o-mini";
    fallback: boolean;
    requested: number;
    accepted: number;
    pruned: number;
    promptHash: string;
  };
}> {
  const prompt = `Analyze this landing page for eye-tracking hotspots: ${url}

Device: ${device}

Return ONLY a JSON object in this exact format:
{"hotspots":[{"x":0.42,"y":0.18,"width":0.32,"height":0.10,"confidence":0.78,"element_type":"cta","reason":"Primary call-to-action button"}]}

Focus on: Main headlines, primary CTAs, logos, hero images, product showcases, pricing.
Ignore: navigation, footers, small text, secondary elements.
All coordinates must be normalized (0-1).
Return 5-8 hotspots maximum.`;

  const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 16);
  
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn("No OpenAI API key, using fallback hotspots");
    return getFallbackResponse(promptHash);
  }

  try {
    // Add 15s timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("OpenAI timeout after 15s")), 15000);
    });

    const fetchPromise = fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert in web design and eye-tracking patterns. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      })
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

    if (!response.ok) {
      console.warn(`OpenAI API error: ${response.status}`);
      return getFallbackResponse(promptHash);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.warn("No content from OpenAI");
      return getFallbackResponse(promptHash);
    }

    const parsed = JSON.parse(content);
    let hotspots = parsed.hotspots || [];

    if (!Array.isArray(hotspots) || hotspots.length === 0) {
      console.warn("Invalid hotspots format from OpenAI");
      return getFallbackResponse(promptHash);
    }

    const requested = hotspots.length;
    const { kept } = clampAndValidateHotspots(hotspots);
    
    // Apply parity rules
    let filtered = kept;
    if (parity) {
      filtered = kept.filter(h => h.confidence >= 0.25);
    }
    
    const processed = greedyDeoverlap(filtered, { max: 8, iouThreshold: 0.4 });
    
    // If empty after sanitization, use fallback
    if (processed.length === 0) {
      console.warn("No hotspots survived sanitization");
      return getFallbackResponse(promptHash);
    }

    return {
      hotspots: processed,
      meta: {
        engine: "phase7",
        model: "gpt-4o-mini",
        fallback: false,
        requested,
        accepted: processed.length,
        pruned: requested - processed.length,
        promptHash
      }
    };

  } catch (error) {
    console.warn("OpenAI error:", error);
    return getFallbackResponse(promptHash);
  }
}

function getFallbackResponse(promptHash: string) {
  const fallbackHotspots = getFallbackHotspots();
  const { kept } = clampAndValidateHotspots(fallbackHotspots);
  const processed = greedyDeoverlap(kept, { max: 8, iouThreshold: 0.4 });
  
  return {
    hotspots: processed,
    meta: {
      engine: "phase7" as const,
      model: "gpt-4o-mini" as const,
      fallback: true,
      requested: fallbackHotspots.length,
      accepted: processed.length,
      pruned: fallbackHotspots.length - processed.length,
      promptHash
    }
  };
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
