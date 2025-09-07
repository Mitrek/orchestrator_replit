
import OpenAI from "openai";
import pino from "pino";

const logger = pino();

type DOMElement = {
  tag: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  className: string;
  id: string;
  zIndex: number;
  fontSize: number;
  fontWeight: string;
};

type Hotspot = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  element_type: string;
  reason?: string;
};

export async function predictHotspots(domSummary: DOMElement[], viewport: { width: number; height: number }): Promise<Hotspot[]> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
    logger.info('Using advanced fallback hotspot detection (no OpenAI API key found)');
    return advancedHotspotDetection(domSummary, viewport);
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const elementsAboveFold = domSummary.filter(el => el.y < viewport.height * 1.5);
    const elementsText = elementsAboveFold
      .map(el => `${el.x},${el.y},${el.width},${el.height},${el.tag},"${el.text.substring(0, 50)}","${el.className}"`)
      .join('\n');

    const prompt = `Analyze this landing page for eye-tracking hotspots. Prioritize elements above the fold (y < ${viewport.height}px).
Elements (x, y, width, height, tag, text, className):
${elementsText}

Return ONLY a JSON object containing a single key "hotspots" with a JSON array of the TOP 5-8 most eye-catching elements. Each must have: { "x": number, "y": number, "width": number, "height": number, "confidence": 0.1-1.0, "reason": "brief explanation", "element_type": "headline|cta|logo|hero|product|price" }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert in web design and eye-tracking patterns.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content.trim());
    if (Array.isArray(result.hotspots)) {
      return result.hotspots;
    }
    
    throw new Error('Invalid JSON response from OpenAI');
  } catch (error) {
    logger.warn({ error: error.message }, 'OpenAI error, using fallback detection');
    return advancedHotspotDetection(domSummary, viewport);
  }
}

function advancedHotspotDetection(elements: DOMElement[], viewport: { width: number; height: number }): Hotspot[] {
  const hotspots = elements.map(el => {
    let score = 0;
    let type = 'other';

    // Position scoring
    if (el.y < viewport.height / 3) score += 0.5;
    else if (el.y < viewport.height) score += 0.2;

    // Center bias
    const centerX = viewport.width / 2;
    if (Math.abs(el.x + el.width / 2 - centerX) < 250) score += 0.2;

    // Size scoring
    if (el.width * el.height > 50000) score += 0.4;

    // Tag-specific scoring
    if (el.tag === 'h1') { score += 0.6; type = 'headline'; }
    
    const isCta = el.tag === 'button' || 
                  (el.className || '').toLowerCase().includes('btn') || 
                  (el.className || '').toLowerCase().includes('cta');
    if (isCta) { score += 0.5; type = 'cta'; }

    if ((el.tag === 'img' || el.tag === 'svg') && 
        (el.className || '').toLowerCase().includes('logo')) {
      score += 0.4;
      type = 'logo';
    }

    if ((el.tag === 'img' || el.tag === 'video') && 
        el.width > 300 && el.height > 200 && el.y < viewport.height * 0.75) {
      score += 0.45;
      type = 'hero';
    }

    // Typography scoring
    const fontWeight = parseInt(el.fontWeight) || (el.fontWeight === 'bold' ? 700 : 400);
    if (fontWeight >= 700) score += 0.15;
    if (el.fontSize > 32) score += 0.25;

    return {
      ...el,
      confidence: Math.min(score, 1.0),
      element_type: type
    };
  }).filter(h => h.confidence > 0.3 && h.y < viewport.height);

  const sortedHotspots = hotspots.sort((a, b) => b.confidence - a.confidence);
  const filteredHotspots: Hotspot[] = [];

  for (const hotspot of sortedHotspots) {
    let overlaps = false;
    for (const existing of filteredHotspots) {
      const overlapX = Math.max(0, Math.min(hotspot.x + hotspot.width, existing.x + existing.width) - Math.max(hotspot.x, existing.x));
      const overlapY = Math.max(0, Math.min(hotspot.y + hotspot.height, existing.y + existing.height) - Math.max(hotspot.y, existing.y));
      if ((overlapX * overlapY) / (hotspot.width * hotspot.height) > 0.6) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) filteredHotspots.push(hotspot);
    if (filteredHotspots.length >= 8) break;
  }

  return filteredHotspots;
}
