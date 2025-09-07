
import OpenAI from 'openai';
import pino from 'pino';

const logger = pino();

export interface DOMElement {
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
}

export interface Hotspot {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export async function predictHotspots(
  domElements: DOMElement[],
  viewport: { width: number; height: number }
): Promise<Hotspot[]> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key') {
    logger.info('Using fallback hotspot detection (no OpenAI API key)');
    return fallbackHotspotDetection(domElements, viewport);
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const elementsAboveFold = domElements.filter(el => el.y < viewport.height * 1.5);

    const csv = elementsAboveFold.map((el, i) =>
      [
        i, el.x, el.y, el.width, el.height,
        el.tag, (el.text || '').slice(0, 80).replace(/\s+/g, ' ')
      ].join(',')
    ).join('\n');

    const prompt = `You prioritize above-the-fold attention on landing pages. From rows (index,x,y,w,h,tag,text), return a JSON with key "hotspots": an array of up to 8 items with {index, confidence:0..1}. Focus headlines, hero, CTA, price, product visuals. Return ONLY JSON.`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert in web attention patterns.' },
        { role: 'user', content: `Viewport: ${viewport.width}x${viewport.height}\n${csv}\n\n${prompt}` }
      ],
      temperature: 0.2,
      max_tokens: 500
    });

    let hotspots: Array<{index:number; confidence:number}> = [];
    try {
      const text = resp.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(text);
      hotspots = Array.isArray(parsed?.hotspots) ? parsed.hotspots : [];
    } catch (e) {
      logger.warn({ e }, 'AI JSON parse failed; falling back to heuristic');
      return fallbackHotspotDetection(domElements, viewport);
    }

    // De-duplicate overlapping boxes (IoU > 0.6)
    const chosen: typeof hotspots = [];
    for (const h of hotspots) {
      if (h.index >= elementsAboveFold.length) continue;
      const el = elementsAboveFold[h.index];
      const boxA = { x: el.x, y: el.y, w: el.width, h: el.height };
      let keep = true;
      for (const k of chosen) {
        const ek = elementsAboveFold[k.index];
        const boxB = { x: ek.x, y: ek.y, w: ek.width, h: ek.height };
        const interW = Math.max(0, Math.min(boxA.x+boxA.w, boxB.x+boxB.w) - Math.max(boxA.x, boxB.x));
        const interH = Math.max(0, Math.min(boxA.y+boxA.h, boxB.y+boxB.h) - Math.max(boxA.y, boxB.y));
        const inter = interW * interH;
        const iou = inter / (boxA.w*boxA.h + boxB.w*boxB.h - inter || 1);
        if (iou > 0.6) { keep = false; break; }
      }
      if (keep) chosen.push(h);
    }

    return chosen.map(h => {
      const el = elementsAboveFold[h.index];
      return {
        x: el.x + el.width/2,
        y: el.y + el.height/2,
        width: el.width,
        height: el.height,
        confidence: h.confidence
      };
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'OpenAI API failed, using fallback');
    return fallbackHotspotDetection(domElements, viewport);
  }
}

function fallbackHotspotDetection(elements: DOMElement[], viewport: { width: number; height: number }): Hotspot[] {
  const hotspots = elements.map(el => {
    let score = 0;
    let type = 'other';
    
    // Above-the-fold bonus
    if (el.y < viewport.height / 3) score += 0.5;
    else if (el.y < viewport.height) score += 0.2;
    
    // Center bias
    const centerX = viewport.width / 2;
    if (Math.abs(el.x + el.width / 2 - centerX) < 250) score += 0.2;
    
    // Size bonus
    if (el.width * el.height > 50000) score += 0.4;
    
    // Tag-specific scoring
    if (el.tag === 'h1') { score += 0.6; type = 'headline'; }
    
    const isCta = el.tag === 'button' || 
                  (el.className || '').toLowerCase().includes('btn') || 
                  (el.className || '').toLowerCase().includes('cta');
    if (isCta) { score += 0.5; type = 'cta'; }
    
    if ((el.tag === 'img' || el.tag === 'svg') && 
        (el.className || '').toLowerCase().includes('logo')) { 
      score += 0.4; type = 'logo'; 
    }
    
    if ((el.tag === 'img' || el.tag === 'video') && 
        el.width > 300 && el.height > 200 && el.y < viewport.height * 0.75) { 
      score += 0.45; type = 'hero'; 
    }
    
    const fontWeight = parseInt(el.fontWeight) || (el.fontWeight === 'bold' ? 700 : 400);
    if (fontWeight >= 700) score += 0.15;
    if (el.fontSize > 32) score += 0.25;
    
    return { 
      x: el.x + el.width/2,
      y: el.y + el.height/2,
      width: el.width,
      height: el.height,
      confidence: Math.min(score, 1.0)
    };
  }).filter(h => h.confidence > 0.3 && h.y < viewport.height);

  return hotspots.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}
