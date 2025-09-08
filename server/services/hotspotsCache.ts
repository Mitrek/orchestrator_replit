import type { Hotspot } from "./validation";

// Cache stats for metrics
let cacheHits = 0;
let cacheMisses = 0;

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
  if (!entry) {
    cacheMisses++;
    return undefined;
  }

  // Check TTL
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(k);
    cacheMisses++;
    return undefined;
  }

  cacheHits++;
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

export function getCacheStats() {
  const entries = cache.size;
  const total = cacheHits + cacheMisses;
  const hitRatio = total > 0 ? cacheHits / total : 0;

  // Calculate average age
  let totalAge = 0;
  let count = 0;
  const now = Date.now();

  for (const entry of cache.values()) {
    totalAge += now - entry.ts;
    count++;
  }

  const avgAgeMs = count > 0 ? totalAge / count : 0;

  return {
    entries,
    hits: cacheHits,
    misses: cacheMisses,
    hitRatio,
    avgAgeMs
  };
}