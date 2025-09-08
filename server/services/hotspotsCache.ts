
import type { Hotspot } from "./validation";

interface CacheEntry {
  ts: number;
  hotspots: Hotspot[];
  meta: any;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export function key(parts: {
  url: string;
  device: "desktop" | "tablet" | "mobile";
  parity: boolean;
  promptHash: string;
}): string {
  return `${parts.url}:${parts.device}:${parts.parity}:${parts.promptHash}`;
}

export function get(k: string): CacheEntry | undefined {
  const entry = cache.get(k);
  if (!entry) return undefined;
  
  const now = Date.now();
  if (now - entry.ts > TTL_MS) {
    cache.delete(k);
    return undefined;
  }
  
  return entry;
}

export function set(k: string, hotspots: Hotspot[], meta: any): void {
  cache.set(k, {
    ts: Date.now(),
    hotspots,
    meta
  });
  
  // Clean expired entries periodically
  if (cache.size > 100) {
    cleanup();
  }
}

function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.ts > TTL_MS) {
      cache.delete(key);
    }
  }
}
