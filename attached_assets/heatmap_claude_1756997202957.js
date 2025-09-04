#!/usr/bin/env node

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import OpenAI from 'openai';

// OpenAI client initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
});

class HeatmapGenerator {
  constructor() {
    this.viewport = { width: 1200, height: 800 };
    this.foldLine = 600; // Above-the-fold cutoff
  }

  async generateHeatmap(url, outputPath = 'heatmap.png') {
    console.log(`Analyzing ${url}...`);
    
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setViewport(this.viewport);
      
      // Navigate and wait for page load
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Remove noisy elements that interfere with eye tracking
      await this.removeNoisyElements(page);
      
      // Take screenshot
      const screenshotBuffer = await page.screenshot({ fullPage: false });
      
      // Extract elements for analysis
      const elements = await this.extractElements(page);
      
      // Get AI predictions for hotspots or use fallback
      const hotspots = await this.predictHotspots(elements, url);
      
      // Verify hotspots are above the fold and relevant
      const verifiedHotspots = this.verifyHotspots(hotspots, elements);
      
      console.log(`Found ${verifiedHotspots.length} verified hotspots`);
      
      // Generate final heatmap
      await this.renderHeatmap(screenshotBuffer, verifiedHotspots, outputPath);
      
      console.log(`Heatmap saved to: ${outputPath}`);
      return { hotspots: verifiedHotspots, outputPath };
      
    } catch (error) {
      console.error('Error generating heatmap:', error.message);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  async removeNoisyElements(page) {
    await page.evaluate(() => {
      // Remove cookie banners, popups, overlays
      const noisySelectors = [
        '[class*="cookie"]', '[id*="cookie"]',
        '[class*="banner"]', '[id*="banner"]',
        '[class*="popup"]', '[id*="popup"]',
        '[class*="modal"]', '[id*="modal"]',
        '[class*="overlay"]', '[id*="overlay"]',
        '[class*="notification"]', '[id*="notification"]',
        '.fixed[style*="bottom"]', '.sticky[style*="bottom"]',
        '[role="dialog"]', '[role="alert"]',
        '[class*="gdpr"]', '[class*="consent"]'
      ];
      
      noisySelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          // Only remove if it's likely a noise element
          const rect = el.getBoundingClientRect();
          const text = el.textContent.toLowerCase();
          if (text.includes('cookie') || text.includes('accept') || 
              text.includes('consent') || rect.height > 100) {
            el.remove();
          }
        });
      });
    });
  }

  async extractElements(page) {
    return await page.evaluate(() => {
      const elements = [];
      const selectors = [
        'h1', 'h2', 'h3', // Headlines
        'button', 'a[href]', // CTAs and links
        'img', 'video', // Media
        '[class*="logo"]', '[id*="logo"]', // Logos
        '[class*="hero"]', '[class*="banner"]', // Hero sections
        '[class*="cta"]', '[class*="button"]', // CTAs
        '.price', '[class*="price"]', // Pricing
        '[class*="product"]', '[class*="feature"]' // Products/features
      ];
      
      selectors.forEach(selector => {
        const nodeList = document.querySelectorAll(selector);
        nodeList.forEach(el => {
          const rect = el.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(el);
          
          // Skip hidden or tiny elements
          if (rect.width < 10 || rect.height < 10 || 
              computedStyle.display === 'none' || 
              computedStyle.visibility === 'hidden') return;
          
          const element = {
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().substring(0, 200) || '',
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            className: el.className || '',
            id: el.id || '',
            href: el.href || '',
            src: el.src || '',
            zIndex: parseInt(computedStyle.zIndex) || 0,
            fontSize: parseFloat(computedStyle.fontSize) || 0,
            fontWeight: computedStyle.fontWeight || 'normal',
            color: computedStyle.color || '',
            backgroundColor: computedStyle.backgroundColor || '',
            isVisible: rect.top < window.innerHeight && rect.bottom > 0
          };
          
          elements.push(element);
        });
      });
      
      return elements.filter(el => el.isVisible && el.y < 600); // Above the fold only
    });
  }

  async predictHotspots(elements, url) {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.log('Using advanced fallback hotspot detection (no OpenAI API key)');
      return this.advancedHotspotDetection(elements);
    }

    try {
      const prompt = `Analyze this landing page for eye-tracking hotspots. Focus ONLY on above-the-fold elements (y < 600px).

URL: ${url}

Elements (x, y, width, height, tag, text, className):
${elements.map(el => 
  `${el.x},${el.y},${el.width},${el.height},${el.tag},"${el.text.substring(0,50)}","${el.className}"`
).join('\n')}

Return ONLY a JSON array of the TOP 5-8 most eye-catching elements that users would naturally look at first. Each should have:
{
  "x": number,
  "y": number, 
  "width": number,
  "height": number,
  "confidence": 0.1-1.0,
  "reason": "brief explanation",
  "element_type": "headline|cta|logo|hero|product|price"
}

Focus on: Main headlines, primary CTAs, logos, hero images, product showcases, pricing. Ignore: navigation, footers, small text, secondary elements.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in web design and eye-tracking patterns. Analyze landing pages to predict where users will look first based on visual hierarchy, contrast, positioning, and typical user behavior patterns.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const content = response.choices[0].message.content.trim();
      const jsonMatch = content.match(/\[.*\]/s);
      
      if (jsonMatch) {
        const hotspots = JSON.parse(jsonMatch[0]);
        console.log(`AI identified ${hotspots.length} potential hotspots`);
        return hotspots.filter(h => h.y < this.foldLine); // Double-check above fold
      } else {
        throw new Error('Invalid JSON response from OpenAI');
      }
      
    } catch (error) {
      console.log(`OpenAI error: ${error.message}, using advanced fallback detection`);
      return this.advancedHotspotDetection(elements);
    }
  }

  advancedHotspotDetection(elements) {
    console.log(`Analyzing ${elements.length} elements with advanced scoring...`);
    const hotspots = [];
    
    // Enhanced scoring system based on eye-tracking research
    elements.forEach(el => {
      let score = 0;
      let type = 'other';
      let reasons = [];
      
      // 1. POSITION SCORING (F-pattern and visual hierarchy)
      // Top section gets highest priority (first 200px)
      if (el.y < 100) { 
        score += 0.5; 
        reasons.push('prime top position');
      } else if (el.y < 200) { 
        score += 0.4; 
        reasons.push('high position');
      } else if (el.y < 400) { 
        score += 0.2; 
        reasons.push('above fold');
      }
      
      // Left side preference (F-pattern reading)
      if (el.x < 300) { 
        score += 0.25; 
        reasons.push('left alignment');
      } else if (el.x < 600) { 
        score += 0.15; 
      }
      
      // Center focus bonus for key elements
      const centerX = this.viewport.width / 2;
      const distanceFromCenter = Math.abs(el.x + el.width/2 - centerX);
      if (distanceFromCenter < 200) {
        score += 0.2;
        reasons.push('center focus');
      }
      
      // 2. SIZE AND VISUAL IMPACT SCORING
      const area = el.width * el.height;
      const aspectRatio = el.width / el.height;
      
      // Area scoring with diminishing returns
      if (area > 50000) { 
        score += 0.4; 
        reasons.push('large element');
      } else if (area > 20000) { 
        score += 0.3; 
        reasons.push('medium-large');
      } else if (area > 10000) { 
        score += 0.2; 
      }
      
      // Aspect ratio considerations
      if (aspectRatio > 0.5 && aspectRatio < 3) {
        score += 0.1; // Good readability ratio
      }
      
      // 3. ELEMENT TYPE SCORING (semantic importance)
      const text = el.text.toLowerCase();
      const className = el.className.toLowerCase();
      const id = el.id.toLowerCase();
      
      if (el.tag === 'h1') { 
        score += 0.6; 
        type = 'headline';
        reasons.push('main headline');
      } else if (el.tag === 'h2') { 
        score += 0.4; 
        type = 'headline';
        reasons.push('secondary headline');
      } else if (el.tag === 'h3') { 
        score += 0.25; 
        type = 'headline';
        reasons.push('tertiary headline');
      }
      
      // CTA and button detection (enhanced)
      const ctaKeywords = ['btn', 'button', 'cta', 'call-to-action', 'primary', 'secondary'];
      const ctaText = ['buy', 'get', 'start', 'try', 'join', 'sign up', 'download', 'learn more', 'contact', 'subscribe'];
      
      if (el.tag === 'button' || 
          ctaKeywords.some(keyword => className.includes(keyword)) ||
          ctaText.some(keyword => text.includes(keyword))) {
        
        // Primary CTA detection
        if (className.includes('primary') || className.includes('cta') || 
            text.includes('get started') || text.includes('buy now')) {
          score += 0.5;
          reasons.push('primary CTA');
        } else {
          score += 0.35;
          reasons.push('CTA button');
        }
        type = 'cta';
      }
      
      // Logo detection (enhanced)
      if ((el.tag === 'img' || el.tag === 'svg') && 
          (className.includes('logo') || id.includes('logo') || 
           text.includes('logo') || el.src?.includes('logo'))) {
        score += 0.4;
        type = 'logo';
        reasons.push('brand logo');
      }
      
      // Hero image/video detection
      if ((el.tag === 'img' || el.tag === 'video') && 
          el.width > 300 && el.height > 200) {
        if (className.includes('hero') || className.includes('banner') || 
            el.y < 300) { // Above fold hero
          score += 0.45;
          type = 'hero';
          reasons.push('hero image');
        } else {
          score += 0.3;
          type = 'product';
          reasons.push('product image');
        }
      }
      
      // Pricing detection (enhanced)
      const priceKeywords = ['price', 'pricing', 'cost', '$', '€', '£', '¥'];
      if (priceKeywords.some(keyword => text.includes(keyword) || className.includes(keyword))) {
        score += 0.35;
        type = 'price';
        reasons.push('pricing info');
      }
      
      // Product/feature sections
      if (className.includes('product') || className.includes('feature') || 
          className.includes('service') || className.includes('benefit')) {
        score += 0.3;
        type = type === 'other' ? 'product' : type;
        reasons.push('product/feature');
      }
      
      // 4. TYPOGRAPHY AND VISUAL WEIGHT SCORING
      const fontWeight = typeof el.fontWeight === 'string' ? 
        (el.fontWeight === 'bold' ? 700 : 
         el.fontWeight === 'normal' ? 400 : parseInt(el.fontWeight) || 400) : 
        el.fontWeight;
      
      if (fontWeight >= 700) {
        score += 0.15;
        reasons.push('bold text');
      } else if (fontWeight >= 600) {
        score += 0.1;
      }
      
      // Font size scoring
      if (el.fontSize > 32) {
        score += 0.25;
        reasons.push('large text');
      } else if (el.fontSize > 24) {
        score += 0.2;
        reasons.push('medium-large text');
      } else if (el.fontSize > 18) {
        score += 0.1;
      }
      
      // 5. CONTEXT AND INTERACTION SCORING
      // Links get slight bonus
      if (el.href && el.href !== '#') {
        score += 0.1;
        reasons.push('interactive link');
      }
      
      // High z-index elements (overlays, modals) get attention
      if (el.zIndex > 10) {
        score += 0.15;
        reasons.push('overlay element');
      }
      
      // 6. CONTENT QUALITY SCORING
      // Meaningful text gets bonus
      if (el.text.length > 5 && el.text.length < 100) {
        score += 0.1; // Sweet spot for readability
      }
      
      // Filter out very low scoring elements
      if (score > 0.3) {
        hotspots.push({
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          confidence: Math.min(score, 1.0),
          reason: reasons.join(', '),
          element_type: type,
          rawScore: score,
          text: el.text.substring(0, 50),
          tag: el.tag
        });
      }
    });
    
    // Advanced post-processing
    // Remove overlapping elements (keep highest scoring)
    const filteredHotspots = [];
    const sortedHotspots = hotspots.sort((a, b) => b.confidence - a.confidence);
    
    for (const hotspot of sortedHotspots) {
      let overlaps = false;
      
      for (const existing of filteredHotspots) {
        // Check for significant overlap
        const overlapX = Math.max(0, Math.min(hotspot.x + hotspot.width, existing.x + existing.width) - 
                                    Math.max(hotspot.x, existing.x));
        const overlapY = Math.max(0, Math.min(hotspot.y + hotspot.height, existing.y + existing.height) - 
                                    Math.max(hotspot.y, existing.y));
        const overlapArea = overlapX * overlapY;
        const hotspotArea = hotspot.width * hotspot.height;
        
        // If more than 60% overlap, consider it duplicate
        if (overlapArea / hotspotArea > 0.6) {
          overlaps = true;
          break;
        }
      }
      
      if (!overlaps) {
        filteredHotspots.push(hotspot);
      }
      
      // Stop at 8 hotspots
      if (filteredHotspots.length >= 8) break;
    }
    
    console.log(`Advanced scoring found ${filteredHotspots.length} high-quality hotspots`);
    
    // Debug output
    filteredHotspots.forEach((hotspot, i) => {
      console.log(`  ${i+1}. ${hotspot.element_type} (${Math.round(hotspot.confidence*100)}%) - ${hotspot.reason}`);
    });
    
    return filteredHotspots;
  }

  verifyHotspots(hotspots, elements) {
    return hotspots.filter(hotspot => {
      // Must be above the fold
      if (hotspot.y > this.foldLine) return false;
      
      // Must have reasonable dimensions
      if (hotspot.width < 10 || hotspot.height < 10) return false;
      if (hotspot.width > 1200 || hotspot.height > 600) return false;
      
      // Must be within viewport
      if (hotspot.x < 0 || hotspot.x > this.viewport.width) return false;
      if (hotspot.y < 0) return false;
      
      // Confidence threshold (lowered slightly for better coverage)
      if (hotspot.confidence < 0.25) return false;
      
      return true;
    });
  }

  async renderHeatmap(screenshotBuffer, hotspots, outputPath) {
    const img = await loadImage(screenshotBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    
    // Draw original screenshot
    ctx.drawImage(img, 0, 0);
    
    // Draw baseline heat layer (red above fold, blue below)
    ctx.globalAlpha = 0.2;
    
    // Red above the fold
    const gradient1 = ctx.createLinearGradient(0, 0, 0, this.foldLine);
    gradient1.addColorStop(0, 'rgba(255, 0, 0, 0.3)');
    gradient1.addColorStop(1, 'rgba(255, 100, 0, 0.1)');
    ctx.fillStyle = gradient1;
    ctx.fillRect(0, 0, img.width, this.foldLine);
    
    // Blue below the fold
    const gradient2 = ctx.createLinearGradient(0, this.foldLine, 0, img.height);
    gradient2.addColorStop(0, 'rgba(0, 100, 255, 0.1)');
    gradient2.addColorStop(1, 'rgba(0, 0, 255, 0.2)');
    ctx.fillStyle = gradient2;
    ctx.fillRect(0, this.foldLine, img.width, img.height - this.foldLine);
    
    // Draw hotspot overlays
    hotspots.forEach(hotspot => {
      const intensity = hotspot.confidence;
      
      // Heat gradient for hotspot
      ctx.globalAlpha = intensity * 0.4;
      const heatGradient = ctx.createRadialGradient(
        hotspot.x + hotspot.width/2, 
        hotspot.y + hotspot.height/2, 
        0,
        hotspot.x + hotspot.width/2, 
        hotspot.y + hotspot.height/2, 
        Math.max(hotspot.width, hotspot.height)
      );
      heatGradient.addColorStop(0, 'rgba(255, 255, 0, 0.8)');
      heatGradient.addColorStop(0.5, 'rgba(255, 150, 0, 0.6)');
      heatGradient.addColorStop(1, 'rgba(255, 0, 0, 0.2)');
      
      ctx.fillStyle = heatGradient;
      ctx.fillRect(hotspot.x - 20, hotspot.y - 20, hotspot.width + 40, hotspot.height + 40);
      
      // Yellow circle marker
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = 'rgba(255, 255, 0, 1)';
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = 3;
      
      const centerX = hotspot.x + hotspot.width/2;
      const centerY = hotspot.y + hotspot.height/2;
      const radius = Math.min(25, Math.max(hotspot.width, hotspot.height) / 4);
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // Confidence indicator
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        Math.round(intensity * 100) + '%', 
        centerX, 
        centerY + 4
      );
    });
    
    // Save the final image
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);
    
    return outputPath;
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Pseudo Eye-Tracker Heatmap Generator

Usage: node heatmap.js <URL> [output.png]

Environment Variables:
  OPENAI_API_KEY - Your OpenAI API key for intelligent hotspot detection

Examples:
  node heatmap.js https://example.com
  node heatmap.js https://example.com custom-heatmap.png
  OPENAI_API_KEY=sk-... node heatmap.js https://landing-page.com
`);
    process.exit(1);
  }
  
  const url = args[0];
  const outputPath = args[1] || `heatmap-${Date.now()}.png`;
  
  if (!url.startsWith('http')) {
    console.error('Please provide a valid URL starting with http:// or https://');
    process.exit(1);
  }
  
  const generator = new HeatmapGenerator();
  
  try {
    const result = await generator.generateHeatmap(url, outputPath);
    console.log('\nSuccess!');
    console.log(`Hotspots found: ${result.hotspots.length}`);
    console.log(`Output: ${result.outputPath}`);
    
    // Print hotspot summary
    result.hotspots.forEach((hotspot, i) => {
      console.log(`  ${i+1}. ${hotspot.element_type} (${Math.round(hotspot.confidence*100)}%) - ${hotspot.reason}`);
    });
    
  } catch (error) {
    console.error('Failed to generate heatmap:', error.message);
    process.exit(1);
  }
}

// Check if this file is being run directly
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.argv[1] === __filename) {
  main();
}

export { HeatmapGenerator };