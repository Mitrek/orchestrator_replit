import fs from 'fs';
import readline from 'readline';
import pino from "pino";

const logger = pino();

type Session = {
  viewport: { w: number; h: number };
  clicks?: Array<{ x: number; y: number; sx?: number; sy?: number }>;
  movements?: Array<{ x: number; y: number; sx?: number; sy?: number }>;
  scrolls?: Array<{ y_percent: number }>;
};

type Point = {
  x: number;
  y: number;
  sx?: number;
  sy?: number;
  type: 'click' | 'movement';
};

export async function* streamJsonl(filePath: string): AsyncGenerator<Session> {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      if (line.trim() === '') continue;
      const session = JSON.parse(line);

      if (!session.viewport || isNaN(session.viewport.w) || isNaN(session.viewport.h)) {
        logger.warn('Skipping session with invalid viewport data');
        continue;
      }

      yield session;
    } catch (e) {
      logger.warn({ error: e.message }, 'Could not parse line, skipping');
    }
  }
}

export function segmentByViewport(session: Session): 'desktop' | 'tablet' | 'mobile' {
  const { w, h } = session.viewport;
  const ratio = w / h;

  if (ratio < 1) { // Portrait
    return ratio < 0.6 ? 'mobile' : 'tablet';
  } else { // Landscape
    return ratio > 1.5 ? 'desktop' : 'tablet';
  }
}

export function normalizedToAbsolute(
  point: { x: number; y: number; sy?: number },
  pageHeight: number,
  viewportHeight: number,
  viewportWidth: number
): { x: number; y: number } {
  const sy = Math.max(0, Math.min(1, Number(point.sy ?? 0)));
  const x = Math.max(0, Math.min(1, Number(point.x)));
  const y = Math.max(0, Math.min(1, Number(point.y)));

  const scrollable = Math.max(0, pageHeight - viewportHeight);
  const absY = sy * scrollable + y * viewportHeight;
  const absX = x * viewportWidth;
  return { x: absX, y: absY };
}

function validateNormalizedCoordinate(value: number): number {
  const num = parseFloat(value as any);
  if (!isNaN(num) && isFinite(num)) {
    return Math.max(0, Math.min(1, num));
  }
  return 0;
}

function isValidPoint(point: any): boolean {
  return point &&
    typeof point.x !== 'undefined' &&
    typeof point.y !== 'undefined';
}

export function processSessionData(session: Session): Point[] {
  const validClicks = (session.clicks || []).filter(isValidPoint).map(c => ({ ...c, type: 'click' as const }));
  const validMovements = (session.movements || []).filter(isValidPoint).map(m => ({ ...m, type: 'movement' as const }));

  return [...validClicks, ...validMovements];
}

export function getMaxScroll(session: Session): number {
  if (!session.scrolls || session.scrolls.length === 0) return 0;
  return Math.max(...session.scrolls.map(s => validateNormalizedCoordinate(s.y_percent)));
}