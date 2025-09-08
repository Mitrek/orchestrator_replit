#!/usr/bin/env node

import puppeteer from 'puppeteer';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import OpenAI from 'openai';
import pino from 'pino';
import { fileURLToPath } from 'url';

// --- Production-Grade Logging ---
// This now outputs clean, single-line JSON, which is the standard for cloud services
// and avoids rendering issues in local terminals.
const logger = pino();

// OpenAI client initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
});


// --- Input Validation Helpers ---
/**
 * Ensures a value is a number between 0 and 1.
 * @param {*} value The value to validate.
 * @returns {number} The validated number, clamped between 0 and 1. Returns 0 if invalid.
 */
function validateNormalizedCoordinate(value) {
    const num = parseFloat(value);
    if (!isNaN(num) && isFinite(num)) {
        return Math.max(0, Math.min(1, num));
    }
    return 0; // Default to 0 if invalid
}

/**
 * Validates a user interaction point.
 * @param {object} point The point object to validate ({x, y}).
 * @returns {boolean} True if the point is valid.
 */
function isValidPoint(point) {
    return point &&
        typeof point.x !== 'undefined' &&
        typeof point.y !== 'undefined';
}


class HeatmapGenerator {

  /**
   * Orchestrates the generation of segmented heatmaps for desktop, tablet, and mobile.
   * -- REFACTORED FOR PERFORMANCE & ROBUSTNESS --
   */
  async generateSegmentedHeatmaps(url, dataPath, baseOutputPath) {
    logger.info({ url, dataPath }, '📊 Starting segmented analysis...');

    const segments = {
      desktop: { name: 'Desktop', data: [], viewport: { width: 1920, height: 1080 }, maxScroll: 0 },
      tablet:  { name: 'Tablet',  data: [], viewport: { width: 1024, height: 768  }, maxScroll: 0 },
      mobile:  { name: 'Mobile',  data: [], viewport: { width: 414,  height: 896  }, maxScroll: 0 }
    };

    // --- STREAMING FILE READ ---
    const fileStream = fs.createReadStream(dataPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        if (line.trim() === '') continue;
        const session = JSON.parse(line);

        // --- INPUT VALIDATION ---
        if (!session.viewport || isNaN(session.viewport.w) || isNaN(session.viewport.h)) {
            logger.warn({ session }, 'Skipping session with invalid viewport data.');
            continue;
        }

        const { w, h } = session.viewport;
        const ratio = w / h;

        let targetSegment;
        if (ratio < 1) { // Portrait
            targetSegment = (ratio < 0.6) ? segments.mobile : segments.tablet;
        } else { // Landscape
            targetSegment = (ratio > 1.5) ? segments.desktop : segments.tablet;
        }

        if(targetSegment){
            const validClicks = (session.clicks || []).filter(isValidPoint).map(c => ({...c, type: 'click'}));
            const validMovements = (session.movements || []).filter(isValidPoint).map(m => ({...m, type: 'movement'}));

            targetSegment.data.push(...validClicks, ...validMovements);

            if (session.scrolls && session.scrolls.length > 0) {
                const maxSessionScroll = Math.max(...session.scrolls.map(s => validateNormalizedCoordinate(s.y_percent)));
                targetSegment.maxScroll = Math.max(targetSegment.maxScroll, maxSessionScroll);
            }
        }
      } catch (e) { 
        logger.warn({ line, error: e.message }, 'Could not parse line, skipping.');
      }
    }

    // --- REUSING BROWSER INSTANCE ---
    logger.info('Launching browser instance for all segments...');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox']});
    try {
        for (const key in segments) {
          const segment = segments[key];
          if (segment.data.length > 0) {
            const outputPath = `${baseOutputPath}-${key}.png`;
            logger.info({ segment: segment.name, points: segment.data.length }, `▶️ Generating heatmap...`);
            await this._renderSingleSegment(browser, url, segment.data, segment.viewport, segment.maxScroll, outputPath);
          } else {
            logger.info({ segment: segment.name }, `⏩ Skipping heatmap, no data found.`);
          }
        }
    } finally {
        logger.info('Closing browser instance.');
        if (browser) await browser.close();
    }
  }

  /**
   * Renders a single, full-page heatmap for one segment.
   * -- REFACTORED TO USE AN EXISTING BROWSER INSTANCE --
   */
  async _renderSingleSegment(browser, url, points, viewport, maxScrollPercent, outputPath) {
    let page;
    try {
      page = await browser.newPage();
      await page.setViewport(viewport);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const screenshotBuffer = await page.screenshot({ fullPage: true });
      const screenshotImage = await loadImage(screenshotBuffer);
      const fullPageHeight = screenshotImage.height;

      const hotspots = points.map(point => {
        const scrollYPercent = validateNormalizedCoordinate(point.sy);
        const yPercent = validateNormalizedCoordinate(point.y);
        const xPercent = validateNormalizedCoordinate(point.x);

        const scrollableDist = fullPageHeight > viewport.height ? fullPageHeight - viewport.height : 0;
        const absoluteY = (scrollYPercent * scrollableDist) + (yPercent * viewport.height);

        return {
            x: xPercent * viewport.width,
            y: absoluteY,
            width: 1, height: 1,
            confidence: point.type === 'click' ? 1.0 : 0.3,
            element_type: point.type
        };
      });

      await this.renderHeatmap(screenshotBuffer, hotspots, viewport, maxScrollPercent, outputPath);
      logger.info({ file: path.basename(outputPath) }, `🎨 Heatmap saved successfully.`);
    } catch (error) {
      logger.error({ segment: viewport, error: error.message }, `❌ Failed to generate heatmap for segment.`);
    } finally {
      if (page) await page.close();
    }
  }

  async renderHeatmap(screenshotBuffer, hotspots, viewport, maxScrollPercent = 1.0, outputPath) {
    const img = await loadImage(screenshotBuffer);
    const W = img.width, H = img.height;
    const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0);

    const scrollableDist = H > viewport.height ? H - viewport.height : 0;
    const viewedHeight = viewport.height + (maxScrollPercent * scrollableDist);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#0a192f';
    ctx.fillRect(0, 0, W, viewedHeight);
    ctx.globalAlpha = 1.0;

    if (!hotspots || hotspots.length === 0) {
      logger.info('No hotspots to render. Saving base image with overlay.');
    } else {
        const heatCanvas = createCanvas(W, H);
        const heatCtx = heatCanvas.getContext('2d');

        const sortedHotspots = [...hotspots].sort((a, b) => b.confidence - a.confidence);
        const primaryHotspot = sortedHotspots.length > 0 ? sortedHotspots[0] : null;

        sortedHotspots.forEach(hotspot => {
            if (hotspot.width > 1 || hotspot.height > 1) { // AI Mode
                const centerX = hotspot.x + hotspot.width / 2;
                const centerY = hotspot.y + hotspot.height / 2;

                const isPrimary = hotspot === primaryHotspot;
                const fixationMultiplier = isPrimary ? 1.5 : 1.0;
                // --- ADJUSTMENT: Reduced number of fixations for a dimmer effect ---
                const numFixations = (15 + Math.floor(hotspot.confidence * 20)) * fixationMultiplier;
                const fixationRadius = Math.max(15, (hotspot.width + hotspot.height) / 8);

                for (let i = 0; i < numFixations; i++) {
                    const u1 = Math.random(), u2 = Math.random();
                    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                    const z2 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
                    const x = centerX + z1 * (hotspot.width / 4);
                    const y = centerY + z2 * (hotspot.height / 4);
                    const gradient = heatCtx.createRadialGradient(x, y, 0, x, y, fixationRadius);
                    // --- ADJUSTMENT: Made each point slightly more transparent ---
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    heatCtx.fillStyle = gradient;
                    heatCtx.fillRect(x - fixationRadius, y - fixationRadius, fixationRadius * 2, fixationRadius * 2);
                }
            } else { // Data Mode
                const centerX = hotspot.x;
                const centerY = hotspot.y;
                const radius = Math.max(30, hotspot.confidence * 75); 
                const grad = heatCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
                grad.addColorStop(0, `rgba(255, 255, 255, ${0.15 * hotspot.confidence})`);
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                heatCtx.fillStyle = grad;
                heatCtx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
            }
        });

        const heatData = heatCtx.getImageData(0, 0, W, H).data;
        const colorizedData = ctx.createImageData(W, H);
        const px = colorizedData.data;

        const palette = [ { t: 0.0, c: [0, 0, 255] }, { t: 0.3, c: [0, 255, 255] }, { t: 0.5, c: [0, 255, 0] }, { t: 0.75, c: [255, 255, 0] }, { t: 1.0, c: [255, 0, 0] } ];
        const lerp = (a, b, t) => a + (b - a) * t;

        for (let i = 0; i < heatData.length; i += 4) {
            const alpha = heatData[i + 3] / 255;
            if (alpha > 0) {
                let s = 0;
                while (s < palette.length - 1 && alpha > palette[s + 1].t) s++;
                const p0 = palette[s], p1 = palette[s + 1] || palette[s];
                const u = (p1.t === p0.t) ? 0 : (alpha - p0.t) / (p1.t - p0.t);

                px[i] = Math.round(lerp(p0.c[0], p1.c[0], u));
                px[i + 1] = Math.round(lerp(p0.c[1], p1.c[1], u));
                px[i + 2] = Math.round(lerp(p0.c[2], p1.c[2], u));
                // --- ADJUSTMENT: Removed the 1.5x multiplier to reduce saturation ---
                px[i + 3] = alpha * 255;
            }
        }
        heatCtx.putImageData(colorizedData, 0, 0);

        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(heatCanvas, 0, 0);
    }

    await fs.promises.writeFile(outputPath, canvas.toBuffer('image/png'));
  }

  // --- AI Mode and its helpers ---
  async generateAiHeatmap(url, outputPath = 'heatmap.png') {
    logger.info({ url }, `🚀 Starting AI analysis...`);
    let browser;
    try {
      browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      const viewport = { width: 1920, height: 1080 };
      await page.setViewport(viewport);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.removeNoisyElements(page);

      const screenshotBuffer = await page.screenshot({ fullPage: true }); 

      const elements = await this.extractElements(page, viewport);
      const hotspots = await this.predictHotspots(elements, url, viewport);
      const verifiedHotspots = this.verifyHotspots(hotspots, viewport);
      logger.info({ count: verifiedHotspots.length }, `✅ Found verified hotspots.`);

      await this.renderHeatmap(screenshotBuffer, verifiedHotspots, viewport, 1.0, outputPath);
      logger.info({ file: outputPath }, `🎨 Heatmap saved.`);
    } catch (error) {
      logger.error(error, 'Error during AI heatmap generation.');
    } finally {
      if (browser) await browser.close();
    }
  }

  async removeNoisyElements(page) {
    await page.evaluate(() => {
        const noisySelectors = ['[class*="cookie"]', '[id*="cookie"]', '[class*="banner"]', '[id*="banner"]', '[class*="popup"]', '[id*="popup"]', '[class*="modal"]', '[id*="modal"]', '[class*="overlay"]', '[id*="overlay"]', '[class*="notification"]', '[id*="notification"]', '.fixed[style*="bottom"]', '.sticky[style*="bottom"]', '[role="dialog"]', '[role="alert"]', '[class*="gdpr"]', '[class*="consent"]'];
        noisySelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => el.remove());
        });
    });
  }

  async extractElements(page, viewport) {
    const foldLine = viewport.height; 
    return await page.evaluate((foldLine) => {
        const elements = [];
        const selectors = ['h1', 'h2', 'h3', 'p', 'button', 'a[href]', 'img', 'video', 'svg', '[class*="logo"]', '[id*="logo"]', '[class*="hero"]', '[class*="banner"]', '[class*="cta"]', '[class*="button"]', '.price', '[class*="price"]', '[class*="product"]', '[class*="feature"]'];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const rect = el.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(el);
                if (rect.width < 10 || rect.height < 10 || computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || parseFloat(computedStyle.opacity) < 0.1) return;
                elements.push({
                    tag: el.tagName.toLowerCase(), text: el.textContent?.trim().substring(0, 150) || '',
                    x: Math.round(rect.x), y: Math.round(rect.y + window.scrollY), width: Math.round(rect.width), height: Math.round(rect.height), className: el.className || '', id: el.id || '',
                    zIndex: parseInt(computedStyle.zIndex) || 0, fontSize: parseFloat(computedStyle.fontSize) || 0, fontWeight: computedStyle.fontWeight || 'normal',
                });
            });
        });
        return elements;
    }, foldLine);
  }

  async predictHotspots(elements, url, viewport) {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
      logger.info('⚠️ Using advanced fallback hotspot detection (no OpenAI API key found).');
      return this.advancedHotspotDetection(elements, viewport);
    }
    try {
      const prompt = `Analyze this landing page for eye-tracking hotspots. Prioritize elements above the fold (y < ${viewport.height}px). URL: ${url}\nElements (x, y, width, height, tag, text, className):\n${elements.filter(el => el.y < viewport.height * 1.5).map(el => `${el.x},${el.y},${el.width},${el.height},${el.tag},"${el.text.substring(0,50)}","${el.className}"`).join('\n')}\n\nReturn ONLY a JSON object containing a single key "hotspots" with a JSON array of the TOP 5-8 most eye-catching elements. Each must have: { "x": number, "y": number, "width": number, "height": number, "confidence": 0.1-1.0, "reason": "brief explanation", "element_type": "headline|cta|logo|hero|product|price" }`;
      const response = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are an expert in web design and eye-tracking patterns.' }, { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 1000, response_format: { type: "json_object" } });
      const result = JSON.parse(response.choices[0].message.content.trim());
      if (Array.isArray(result.hotspots)) return result.hotspots;
      throw new Error('Invalid JSON response from OpenAI.');
    } catch (error) {
      logger.warn(error, 'OpenAI error, using fallback detection.');
      return this.advancedHotspotDetection(elements, viewport);
    }
  }

  advancedHotspotDetection(elements, viewport) {
    const hotspots = elements.map(el => {
        let score = 0, type = 'other';
        if (el.y < viewport.height / 3) score += 0.5;
        else if (el.y < viewport.height) score += 0.2;
        const centerX = viewport.width / 2;
        if (Math.abs(el.x + el.width / 2 - centerX) < 250) score += 0.2;
        if (el.width * el.height > 50000) score += 0.4;
        if (el.tag === 'h1') { score += 0.6; type = 'headline'; }
        const isCta = el.tag === 'button' || (el.className || '').toLowerCase().includes('btn') || (el.className || '').toLowerCase().includes('cta');
        if (isCta) { score += 0.5; type = 'cta'; }
        if ((el.tag === 'img' || el.tag === 'svg') && (el.className || '').toLowerCase().includes('logo')) { score += 0.4; type = 'logo'; }
        if ((el.tag === 'img' || el.tag === 'video') && el.width > 300 && el.height > 200 && el.y < viewport.height * 0.75) { score += 0.45; type = 'hero'; }
        const fontWeight = parseInt(el.fontWeight) || (el.fontWeight === 'bold' ? 700 : 400);
        if (fontWeight >= 700) score += 0.15;
        if (el.fontSize > 32) score += 0.25;
        return { ...el, confidence: Math.min(score, 1.0), element_type: type };
    }).filter(h => h.confidence > 0.3 && h.y < viewport.height);

    const sortedHotspots = hotspots.sort((a, b) => b.confidence - a.confidence);
    const filteredHotspots = [];
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

  verifyHotspots(hotspots, viewport) {
    return hotspots.filter(h => h.y < viewport.height && h.width > 10 && h.height > 10 && h.confidence >= 0.25);
  }
}

// --- Main CLI Execution Logic ---
async function main() {
  const args = process.argv.slice(2);
  const modeIndex = args.findIndex(arg => arg === '--mode');
  const mode = modeIndex !== -1 ? args[modeIndex + 1] : null;

  const usage = `
Heatmap Generator Script

Usage:
  node heatmap.js --mode <mode> [options]

Modes:
  ai:   Generates a pseudo eye-tracking heatmap for a desktop view.
        Usage: node heatmap.js --mode ai <URL> [output_base_name]

  data: Generates segmented, full-page heatmaps (desktop, tablet, mobile) from user data.
        Usage: node heatmap.js --mode data <URL> <user_data.jsonl> [output_base_name]
`;

  if (!mode) {
    logger.error('No mode specified. Please use --mode ai or --mode data.');
    logger.info(usage);
    process.exit(1);
  }

  const generator = new HeatmapGenerator();

  try {
    if (mode === 'ai') {
      const url = args[modeIndex + 2];
      const outputBase = args[modeIndex + 3] || `heatmap-ai-${Date.now()}`;
      if (!url || !url.startsWith('http')) { 
        logger.error('Error: Please provide a valid URL for AI mode.'); 
        process.exit(1); 
      }
      await generator.generateAiHeatmap(url, `${outputBase}.png`);

    } else if (mode === 'data') {
      const url = args[modeIndex + 2];
      const dataPath = args[modeIndex + 3];
      const outputBase = args[modeIndex + 4] || `heatmap-data-${Date.now()}`;
      if (!url || !url.startsWith('http') || !dataPath) {
        logger.error('Error: Please provide a URL and a data file path for data mode.');
        logger.info(usage);
        process.exit(1);
      }
      await generator.generateSegmentedHeatmaps(url, dataPath, outputBase);

    } else {
      logger.error(`Error: Unknown mode '${mode}'.`);
      logger.info(usage);
      process.exit(1);
    }
  } catch (error) {
    logger.error(error, `An unrecoverable error occurred`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}


