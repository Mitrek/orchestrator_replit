// heatmap.js — Generate (0–5) eye-catchers → Verify each crop → Clean → Overlay
import puppeteer from "puppeteer";
import fs from "fs/promises";
import sharp from "sharp";
import { PNG } from "pngjs";

// ---------------- CLI ----------------
function getArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const url = getArg("url") || process.argv[2];
const outJpg = getArg("out", "screenshot.jpg");
const width = parseInt(getArg("width", "1440"), 10);
const height = parseInt(getArg("height", "900"), 10);
const alpha = Math.max(0, Math.min(1, parseFloat(getArg("alpha", "0.6"))));           // heat opacity on overlay
const circlesAlpha = Math.max(0, Math.min(1, parseFloat(getArg("circles", "0.85")))); // circle overlay opacity
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------------- tiny utils ----------------
async function parseJsonSafe(str, dumpPathIfFail) {
  try {
    return JSON.parse(str);
  } catch {
    if (dumpPathIfFail) try { await fs.writeFile(dumpPathIfFail, str, "utf-8"); } catch {}
    throw new Error(`Could not parse JSON (raw saved to ${dumpPathIfFail || "N/A"})`);
  }
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function distNorm(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
const pt = (x, y) => ({ x, y });

// helpers for rects (normalized)
function rectCenter(r) { return pt((r.left + r.right) / 2, (r.top + r.bottom) / 2); }
function expandRect(r, eps = 0.03) {
  return {
    left: clamp01(r.left - eps), top: clamp01(r.top - eps),
    right: clamp01(r.right + eps), bottom: clamp01(r.bottom + eps),
    w: clamp01((r.right + eps) - (r.left - eps)),
    h: clamp01((r.bottom + eps) - (r.top - eps))
  };
}
function withinRect(p, r) {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}
function iou(a, b) {
  const L = Math.max(a.left, b.left);
  const T = Math.max(a.top, b.top);
  const R = Math.min(a.right, b.right);
  const B = Math.min(a.bottom, b.bottom);
  const w = Math.max(0, R - L);
  const h = Math.max(0, B - T);
  const inter = w * h;
  const areaA = (a.right - a.left) * (a.bottom - a.top);
  const areaB = (b.right - b.left) * (b.bottom - b.top);
  const uni = areaA + areaB - inter;
  return uni > 0 ? inter / uni : 0;
}
// distance from a point to a rect (0 if inside); all normalized
function distPointToRect(p, r) {
  const dx = (p.x < r.left) ? (r.left - p.x) : (p.x > r.right ? (p.x - r.right) : 0);
  const dy = (p.y < r.top) ? (r.top - p.y) : (p.y > r.bottom ? (p.y - r.bottom) : 0);
  return Math.hypot(dx, dy);
}
function radiusFromRect(category, rect) {
  const size = Math.max(rect.w, rect.h);
  if (category === "product") return clamp01(Math.min(0.10, Math.max(0.06, size * 0.28)));
  if (category === "button")  return clamp01(Math.min(0.14, Math.max(0.08, size * 0.36)));
  if (category === "headline")return clamp01(Math.min(0.18, Math.max(0.10, size * 0.45)));
  return clamp01(Math.min(0.16, Math.max(0.07, size * 0.35)));
}

// --------------- DOM candidates (heuristics) ---------------
async function collectDomCandidates(page) {
  return await page.evaluate(() => {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    const toStr = (v) => (v == null ? "" : String(v));
    const getClassLower = (el) => {
      const fromAttr = el.getAttribute?.("class");
      const fromBase = (el.className && typeof el.className === "object" && "baseVal" in el.className)
        ? el.className.baseVal
        : null;
      const fromStr = (typeof el.className === "string") ? el.className : null;
      return toStr(fromAttr || fromBase || fromStr).toLowerCase();
    };
    const getTextish = (el) => {
      const t = el.innerText || el.textContent || el.getAttribute?.("aria-label") || el.getAttribute?.("alt") || "";
      return toStr(t).trim().slice(0, 160);
    };
    const ancestorsMatch = (el, selector) => {
      let n = el;
      while (n && n !== document.body) {
        if (n.matches?.(selector)) return true;
        n = n.parentElement;
      }
      return false;
    };
    const style = (el) => (el && window.getComputedStyle ? window.getComputedStyle(el) : null);

    const rectN = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left / vpW,
        top: r.top / vpH,
        right: r.right / vpW,
        bottom: r.bottom / vpH,
        w: r.width / vpW,
        h: r.height / vpH,
      };
    };

    const isCookieLike = (txt) => /cookie|consent|allow|deny|preferences/i.test(txt);
    const isBottomFixed = (el) => {
      const cs = style(el);
      if (!cs) return false;
      const pos = cs.position;
      if (pos !== "fixed" && pos !== "sticky") return false;
      const r = el.getBoundingClientRect?.();
      if (!r) return false;
      const topFrac = r.top / vpH;
      const bottomFrac = r.bottom / vpH;
      return topFrac > 0.75 || bottomFrac > 0.90;
    };

    const push = (el, category, out) => {
      const r = el.getBoundingClientRect?.();
      if (!r) return;
      if (!Number.isFinite(r.width) || !Number.isFinite(r.height)) return;
      if (r.width < 24 || r.height < 12) return;
      if (r.bottom <= 0 || r.top >= vpH) return; // must intersect first viewport
      out.push({ category, rect: rectN(el), text: getTextish(el) });
    };

    const cands = [];

    // Buttons (native, role, or class hints) — with cookie/consent filtering & fixed-bottom filtering
    document.querySelectorAll('button,[role="button"],a[href]').forEach((el) => {
      const txt = getTextish(el);
      if (isCookieLike(txt) || isBottomFixed(el) || ancestorsMatch(el, '[role="dialog"],[aria-modal="true"]')) return;
      const cls = getClassLower(el);
      const looksBtn =
        el.tagName === "BUTTON" ||
        el.getAttribute?.("role") === "button" ||
        /(btn|button|cta|primary|submit|buy|start|try|join)/.test(cls);
      if (looksBtn) push(el, "button", cands);
    });

    // Headlines
    document.querySelectorAll('h1,h2,[data-testid*="heading"]').forEach((el) => {
      push(el, "headline", cands);
    });

    // Logos
    document.querySelectorAll('img,svg,use').forEach((el) => {
      const alt = toStr(el.getAttribute?.("alt")).toLowerCase();
      const cls = getClassLower(el);
      if (/logo|brand/.test(alt + " " + cls)) push(el, "logo", cands);
    });

    // Product / hero (faces/body/product imagery near top) — avoid header/nav zones, avoid very shallow boxes
    document.querySelectorAll('img,video,picture,svg,figure,[role="img"]').forEach((el) => {
      if (ancestorsMatch(el, "header,nav")) return;
      const r = el.getBoundingClientRect?.();
      if (!r) return;
      if (r.height / vpH < 0.12) return; // shallow strips (e.g., nav bars)
      const area = (r.width || 0) * (r.height || 0);
      const tall = (r.height || 0) >= 200;
      const wide = (r.width  || 0) >= 200;
      if (r.top < vpH && (area > 40000 || tall || wide)) {
        push(el, "product", cands);
      }
    });

    // Promo/pricing/card sections
    document.querySelectorAll('[class*="card"],[class*="promo"],[class*="pricing"]').forEach((el) => {
      push(el, "promo", cands);
    });

    // De-noise: if a product rect overlaps a logo rect strongly, drop the product one
    const logos = cands.filter(c => c.category === "logo").map(c => c.rect);
    const pruned = cands.filter(c => {
      if (c.category !== "product") return true;
      return !logos.some(lr => {
        // simple IoU
        const L = Math.max(c.rect.left, lr.left);
        const T = Math.max(c.rect.top, lr.top);
        const R = Math.min(c.rect.right, lr.right);
        const B = Math.min(c.rect.bottom, lr.bottom);
        const w = Math.max(0, R - L), h = Math.max(0, B - T);
        const inter = w * h;
        const areaA = (c.rect.right - c.rect.left) * (c.rect.bottom - c.rect.top);
        const areaB = (lr.right - lr.left) * (lr.bottom - lr.top);
        const uni = areaA + areaB - inter;
        const iou = uni > 0 ? inter / uni : 0;
        return iou > 0.6;
      });
    });

    return { cands: pruned, viewport: { w: vpW, h: vpH } };
  });
}

// ---------------- OpenAI: Generate eye-catchers (Pass 1) ----------------
async function callOpenAIEyeCatchers(viewportJpg) {
  const jpgLite = await sharp(viewportJpg)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();

  const base64 = jpgLite.toString("base64");

  const body = {
    model: "gpt-4o",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You analyze a landing-page VIEWPORT image and output eye-catchers as JSON.\n" +
          "Return the MOST IMPORTANT items above the fold: include HEADLINE + primary CTA BUTTON + any prominent HUMAN faces or HERO product imagery if present (up to five points).\n" +
          "Categories: headline, button, product, logo, promo.\n" +
          "Output JSON only: { \"points\": [ { \"x\": number, \"y\": number, \"radius\": number, \"score\": number, \"category\": string } ] }\n" +
          "x,y,radius ∈ [0,1] (radius [0.05,0.18]); score ∈ [0,1]. Avoid empty background/gradients. Prefer diversity; sort by score DESC."
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Return eye-catchers for the VIEWPORT image. JSON only." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }
    ]
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await resp.text();
  if (!resp.ok) {
    try { await fs.writeFile("last_openai_response_gen.txt", raw, "utf-8"); } catch {}
    throw new Error(`OpenAI generate failed: ${resp.status} ${resp.statusText}`);
  }

  let json = null;
  try {
    const parsed = JSON.parse(raw);
    const content = parsed?.choices?.[0]?.message?.content;
    json = typeof content === "string" ? JSON.parse(content) : content;
  } catch {}
  if (!json || !Array.isArray(json.points)) {
    try { await fs.writeFile("last_openai_response_gen.txt", raw, "utf-8"); } catch {}
    throw new Error("Model did not return { points: [...] }");
  }
  return json;
}

// ---------------- Contrast peak inside a DOM rect (Sobel) ----------------
async function findContrastPeakInRect(viewportBuf, vpW, vpH, rect, opts = {}) {
  // Convert normalized rect to pixel rect
  const leftPx = Math.max(0, Math.floor(rect.left * vpW));
  const topPx  = Math.max(0, Math.floor(rect.top  * vpH));
  const wPx = Math.max(1, Math.min(vpW - leftPx, Math.floor((rect.right - rect.left) * vpW)));
  const hPx = Math.max(1, Math.min(vpH - topPx,  Math.floor((rect.bottom - rect.top) * vpH)));

  // Extract grayscale RAW data
  const { data, info } = await sharp(viewportBuf)
    .extract({ left: leftPx, top: topPx, width: wPx, height: hPx })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width, H = info.height, C = info.channels; // C should be 1
  const at = (x, y) => data[(y * W + x) * C];

  // search window (bias upper portion for faces)
  const yStart = opts.biasUpper ? 0 : 0;
  const yEnd   = opts.biasUpper ? Math.max(2, Math.floor(H * 0.65)) : H;

  // Sobel kernels
  const gxK = [-1,0,1, -2,0,2, -1,0,1];
  const gyK = [-1,-2,-1, 0,0,0, 1,2,1];

  let bestVal = -1, bestX = Math.floor(W / 2), bestY = Math.floor(H / 3);

  for (let y = Math.max(1, yStart); y < Math.min(H - 1, yEnd); y++) {
    for (let x = 1; x < W - 1; x++) {
      let gx = 0, gy = 0, k = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const v = at(x + i, y + j);
          gx += v * gxK[k];
          gy += v * gyK[k];
          k++;
        }
      }
      const m = Math.hypot(gx, gy);
      if (m > bestVal) { bestVal = m; bestX = x; bestY = y; }
    }
  }

  const xNorm = (leftPx + bestX) / vpW;
  const yNorm = (topPx  + bestY) / vpH;
  return { x: clamp01(xNorm), y: clamp01(yNorm) };
}

// ---------------- OpenAI: Verify crop (Pass 2) ----------------
async function callOpenAIVerifyCrop(cropJpg, category) {
  const jpgLite = await sharp(cropJpg)
    .resize({ width: 640, withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();

  const base64 = jpgLite.toString("base64");

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a strict binary verifier for a cropped UI image. " +
          "Decide if the crop truly contains the claimed category. " +
          "Categories: headline, button, logo, promo, product. " +
          "Output JSON only: { ok: boolean, confidence: number in [0,1] }"
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Does this crop contain a true \"${category}\"? JSON only.` },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]
      }
    ]
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await resp.text();
  if (!resp.ok) {
    try { await fs.writeFile("last_openai_response_verif.txt", raw, "utf-8"); } catch {}
    return { ok: false, confidence: 0 };
  }

  try {
    const parsed = JSON.parse(raw);
    const content = parsed?.choices?.[0]?.message?.content;
    const json = typeof content === "string" ? JSON.parse(content) : content;
    if (!json || typeof json.ok !== "boolean") return { ok: false, confidence: 0 };
    return { ok: !!json.ok, confidence: Math.max(0, Math.min(1, Number(json.confidence ?? 0))) };
  } catch {
    try { await fs.writeFile("last_openai_response_verif.txt", raw, "utf-8"); } catch {}
    return { ok: false, confidence: 0 };
  }
}

// --------------- Heat layer & overlay ----------------
async function renderOverlay(fullJpgPath, pointsJson, viewportPxHeight, outHeatPngPath, outOverlayPath, heatAlpha, circlesAlpha) {
  const meta = await sharp(fullJpgPath).metadata();
  const fullW = meta.width, fullH = meta.height;
  if (!fullW || !fullH) throw new Error("Failed to read screenshot dimensions.");

  const GW_FULL = 96;
  const GH_FULL = Math.max(32, Math.round((fullH / fullW) * GW_FULL));

  // Red/Blue baseline
  const grid = new Float32Array(GW_FULL * GH_FULL);
  const foldFrac = Math.max(0, Math.min(1, viewportPxHeight / fullH));
  const GH_FOLD = Math.max(1, Math.round(foldFrac * GH_FULL));
  for (let y = 0; y < GH_FULL; y++) {
    const v = (y < GH_FOLD) ? 1.0 : 0.0; // red above fold, blue below
    const o = y * GW_FULL;
    for (let x = 0; x < GW_FULL; x++) grid[o + x] = v;
  }

  // Add verified points as gaussian bumps
  const pts = Array.isArray(pointsJson?.points) ? pointsJson.points : [];
  for (const p of pts) {
    const cx = Math.round(clamp01(p.x) * (GW_FULL - 1));
    const cy = Math.round(clamp01(p.y) * (GH_FOLD - 1)); // only affect above-the-fold region
    const r = Math.max(1, Math.round(clamp01(p.radius) * Math.min(GW_FULL, GH_FULL)));
    const R2 = r * r;
    for (let y = Math.max(0, cy - r); y <= Math.min(GH_FOLD - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(GW_FULL - 1, cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx*dx + dy*dy <= R2) {
          const o = y * GW_FULL + x;
          grid[o] = Math.min(1, grid[o] + 0.25 + (p.score ?? 0.5) * 0.5);
        }
      }
    }
  }

  // Convert grid to PNG heatmap
  const heat = new PNG({ width: GW_FULL, height: GH_FULL });
  for (let y = 0; y < GH_FULL; y++) {
    for (let x = 0; x < GW_FULL; x++) {
      const v = grid[y * GW_FULL + x]; // 0..1
      const R = Math.round(255 * v);
      const B = Math.round(255 * (1 - v));
      const idx = (y * GW_FULL + x) * 4;
      heat.data[idx] = R;
      heat.data[idx+1] = 0;
      heat.data[idx+2] = B;
      heat.data[idx+3] = 255;
    }
  }

  // Upscale heat to full image size
  const heatBuf = PNG.sync.write(heat);
  const heatBig = await sharp(heatBuf)
    .resize({ width: fullW, height: fullH, kernel: "cubic" })
    .png()
    .toBuffer();

  // Compose overlay
  const base = await sharp(fullJpgPath).composite([
    { input: heatBig, blend: "overlay", opacity: heatAlpha }
  ]).toBuffer();

  // Draw circles for points
  const circleLayer = await drawCirclesPng(fullW, fullH, pointsJson?.points || [], circlesAlpha, viewportPxHeight);
  await sharp(base).composite([{ input: circleLayer, blend: "over" }]).png().toFile(outOverlayPath);
  await fs.writeFile(outHeatPngPath, heatBig);
}

async function drawCirclesPng(GW, GH, pts, alpha, viewportPxHeight) {
  const png = new PNG({ width: GW, height: GH });
  for (let i = 0; i < png.data.length; i += 4) png.data[i+3] = 0;

  const R = 255, G = 255, B = 0, A = Math.round(255 * alpha);
  const foldY = viewportPxHeight;

  for (const p of pts) {
    const cx = Math.round(clamp01(p.x) * (GW - 1));
    const cy = Math.round(clamp01(p.y) * (foldY - 1)); // circles only above fold
    const r = Math.round(clamp01(p.radius) * Math.min(GW, GH));
    const r2 = r * r;

    for (let y = Math.max(0, cy - r); y <= Math.min(foldY - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(GW - 1, cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx*dx + dy*dy <= r2) {
          const o = (y * GW + x) * 4;
          png.data[o] = R; png.data[o+1] = G; png.data[o+2] = B; png.data[o+3] = A;
        }
      }
    }
  }
  return PNG.sync.write(png);
}

// --------------- Cleaning / verification ---------------
async function verifyAndCleanPoints(viewportBuf, vpW, vpH, rawPoints, domCands = []) {
  // Normalize, clamp radius, score; allow categories only
  const ALLOWED = new Set(["headline","button","logo","promo","product"]);
  const safe = (rawPoints || [])
    .map(p => ({
      x: clamp01(Number(p.x)),
      y: clamp01(Number(p.y)),
      radius: Math.max(0.05, Math.min(0.18, Number(p.radius ?? 0.12))),
      score: clamp01(Number(p.score ?? 0.5)),
      category: String(p.category || "").toLowerCase()
    }))
    .filter(p => ALLOWED.has(p.category));

  // DOM filtering (keep strong raw even without DOM match)
  const EPS = 0.03; // box expansion for overlap/snapping
  const overlaps = (p, r) => withinRect(p, expandRect(r, EPS));

  let safeFiltered = safe;
  if (Array.isArray(domCands) && domCands.length) {
    safeFiltered = safe.filter(p => {
      const anyOverlap = domCands.some(c => c.category === p.category && c.rect && overlaps(p, c.rect));
      return anyOverlap || p.score >= 0.7;
    });
    if (!safeFiltered.length) safeFiltered = safe;
  }

  // Snap helper: nearest same-category rect by distance-to-rectangle
  const findSnapTarget = (p) => {
    let best = null;
    let bestDist = Infinity;
    for (const c of domCands) {
      if (c.category !== p.category || !c.rect) continue;
      const rExp = expandRect(c.rect, EPS);
      const d = distPointToRect(p, rExp); // 0 if inside
      if (d < bestDist) { best = { c, rExp }; bestDist = d; }
    }
    if (!best) return null;
    const r = best.rExp;
    const thresh = Math.max(0.12, 0.6 * r.w, 0.35 * r.h); // tolerant
    return bestDist <= thresh ? best.rExp : null;
  };

  const verified = [];
  const minDim = Math.min(vpW, vpH);

  for (let idx = 0; idx < safeFiltered.length; idx++) {
    const p = safeFiltered[idx];

    // Snap if possible (overlap or near)
    let rectForSnap = null;
    if (Array.isArray(domCands) && domCands.length) {
      rectForSnap = findSnapTarget(p);
    }

    // Snap using Sobel peak (product biased upper area), else center
    if (rectForSnap) {
      try {
        const peak = await findContrastPeakInRect(
          viewportBuf, vpW, vpH, rectForSnap,
          { biasUpper: p.category === "product" }
        );
        p.x = peak.x; p.y = peak.y;
      } catch {
        p.x = (rectForSnap.left + rectForSnap.right) / 2;
        p.y = (rectForSnap.top  + rectForSnap.bottom) / 2;
      }
      p.radius = radiusFromRect(p.category, rectForSnap);
    }

    // Crop around point (after snapping)
    const cx = Math.round(p.x * (vpW - 1));
    const cy = Math.round(p.y * (vpH - 1));
    const rPx = Math.max(10, p.radius * minDim);
    const half = Math.max(80, Math.min(240, Math.round(rPx * 1.2)));
    const left = Math.max(0, Math.min(vpW - 1, cx - half));
    const top  = Math.max(0, Math.min(vpH - 1, cy - half));
    const w = Math.min(vpW - left, half * 2);
    const h = Math.min(vpH - top,  half * 2);

    const crop = await sharp(viewportBuf).extract({ left, top, width: w, height: h }).jpeg({ quality: 85 }).toBuffer();

    // Verify with the model
    const ver = await callOpenAIVerifyCrop(crop, p.category).catch(async (e) => {
      try { await fs.writeFile(`last_openai_response_verif_${idx}.txt`, String(e?.message||e), "utf-8"); } catch {}
      return { ok: false, confidence: 0 };
    });

    verified.push({ ...p, verify: { ok: !!ver.ok, confidence: clamp01(Number(ver.confidence ?? 0)) } });
  }

  // Per-category verify thresholds (softer for product)
  const CAT_THRESH = { headline: 0.60, button: 0.55, product: 0.40, logo: 0.65, promo: 0.50 };
  let keep = verified.filter(p => {
    const t = CAT_THRESH[p.category] ?? 0.55;
    const strongRaw = p.score >= 0.75 && p.verify.confidence >= (t - 0.05);
    return (p.verify.ok && p.verify.confidence >= t && p.score >= 0.5) || strongRaw;
  });

  // Sort by combined score
  keep.sort((a,b) => (0.6*b.score + 0.4*b.verify.confidence) - (0.6*a.score + 0.4*a.verify.confidence));

  // De-duplicate / avoid overlaps (looser for diversity; extra space for products)
  const MIN_DIST_DEFAULT = 0.10;
  const MIN_DIST_PRODUCT = 0.16;
  const dedup = [];
  for (const p of keep) {
    const minReq = (p.category === "product") ? MIN_DIST_PRODUCT : MIN_DIST_DEFAULT;
    let tooClose = false;
    for (const q of dedup) {
      const req = (p.category === "product" || q.category === "product") ? MIN_DIST_PRODUCT : MIN_DIST_DEFAULT;
      if (distNorm(p, q) < req) { tooClose = true; break; }
    }
    if (!tooClose) dedup.push(p);
    if (dedup.length >= 5) break;
  }

  // Guarantees & fallback — headline/CTA, then up to two products
  const present = (cat) => dedup.some(q => q.category === cat);
  const firstByCat = (arr, cat) => arr.find(p => p.category === cat);

  // Snap helper for forced items
  const snapForced = async (p) => {
    if (!Array.isArray(domCands) || !domCands.length) return p;
    let bestRect = null, bestDist = Infinity;
    for (const c of domCands) {
      if (c.category !== p.category || !c.rect) continue;
      const rExp = expandRect(c.rect, EPS);
      const d = distPointToRect(p, rExp);
      if (d < bestDist) { bestRect = rExp; bestDist = d; }
    }
    if (bestRect) {
      try {
        const peak = await findContrastPeakInRect(
          viewportBuf, vpW, vpH, bestRect,
          { biasUpper: p.category === "product" }
        );
        p.x = peak.x; p.y = peak.y;
      } catch {
        p.x = (bestRect.left + bestRect.right) / 2;
        p.y = (bestRect.top  + bestRect.bottom) / 2;
      }
      p.radius = radiusFromRect(p.category, bestRect);
    }
    return p;
  };

  const forced = [];
  const head = firstByCat(safe, "headline");
  const cta  = firstByCat(safe, "button");
  if (head && !present("headline")) forced.push(await snapForced({ ...head }));
  if (cta  && !present("button"))   forced.push(await snapForced({ ...cta  }));

  if (dedup.length + forced.length < 4) {
    const products = safe.filter(p => p.category === "product").sort((a,b) => b.score - a.score);
    for (const p of products) {
      if (dedup.length + forced.length >= 5) break;
      const snapped = await snapForced({ ...p });
      if (!dedup.some(q => q.category === "product" && distNorm(snapped, q) < MIN_DIST_PRODUCT)) {
        forced.push(snapped);
        if (forced.length >= 2) break;
      }
    }
  }

  return [...dedup, ...forced].slice(0, 5);
}

// ---------------- Main ----------------
(async () => {
  if (!url) {
    console.error("Usage: node heatmap.js --url https://example.com --out out.jpg [--width 1440 --height 900]");
    process.exit(2);
  }
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set.");
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

    // Collect DOM candidates (above the fold)
    const domInfo = await collectDomCandidates(page);
    const domCands = Array.isArray(domInfo?.cands) ? domInfo.cands : [];
    try { await fs.writeFile(outJpg.replace(/\.jpe?g$/i, "") + ".dom.candidates.json", JSON.stringify(domCands, null, 2), "utf-8"); } catch {}

    // Full-page screenshot
    const fullJpgBuf = await page.screenshot({ type: "jpeg", quality: 82, fullPage: true });
    await fs.writeFile(outJpg, fullJpgBuf);
    console.log("Screenshot saved to", outJpg);

    // Crop top viewport (what the model sees)
    const meta = await sharp(fullJpgBuf).metadata();
    const cropH = Math.min(height, meta.height || height);
    const viewportCropBuf = await sharp(fullJpgBuf)
      .extract({ left: 0, top: 0, width: meta.width, height: cropH })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Pass 1: generate candidates
    console.log("OpenAI (generate candidates)…");
    const gen = await callOpenAIEyeCatchers(viewportCropBuf);
    await fs.writeFile(outJpg.replace(/\.jpe?g$/i, "") + ".eyecatchers.raw.json", JSON.stringify(gen, null, 2), "utf-8");

    // Pass 2: verify each crop + clean (with DOM filtering + rectangle-distance snap)
    const vpMeta = await sharp(viewportCropBuf).metadata();
    console.log("OpenAI (verify crops)…");
    const cleanTop = await verifyAndCleanPoints(viewportCropBuf, vpMeta.width, vpMeta.height, gen.points, domCands);
    const verifiedPayload = { points: cleanTop };
    await fs.writeFile(outJpg.replace(/\.jpe?g$/i, "") + ".eyecatchers.verified.json", JSON.stringify(verifiedPayload, null, 2), "utf-8");

    // Render
    const outHeat = outJpg.replace(/\.jpe?g$/i, "") + ".heat.png";
    const outOverlay = outJpg.replace(/\.jpe?g$/i, "") + ".overlay.png";
    console.log("Rendering overlay (baseline + verified circles)…");
    await renderOverlay(outJpg, verifiedPayload, cropH, outHeat, outOverlay, alpha, circlesAlpha);
    console.log(`✓ Heat PNG: ${outHeat}`);
    console.log(`✓ Overlay PNG: ${outOverlay}`);
    if (!cleanTop.length) console.log("Note: no verified points passed thresholds; baseline only.");

  } catch (err) {
    console.error("Error:", err);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();
