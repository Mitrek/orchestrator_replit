
interface RouteCounters {
  ok: number;
  error: number;
  badRequest: number;
  timeout: number;
  cacheHit: number;
  cacheMiss: number;
}

interface LatencyBuckets {
  "<250": number;
  "<500": number;
  "<1000": number;
  "<2000": number;
  ">=2000": number;
}

interface RouteMetrics {
  counters: RouteCounters;
  latency: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    buckets: LatencyBuckets;
  };
  durations: number[]; // Ring buffer for percentile calculation
}

interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRatio: number;
  avgAgeMs: number;
}

class MetricsCollector {
  private routes: Map<string, RouteMetrics> = new Map();
  private maxDurations = 200; // Ring buffer size
  private startTime = Date.now();

  constructor() {
    // Initialize common routes
    this.initRoute("/api/v1/heatmap");
    this.initRoute("/api/v1/heatmap/data");
    this.initRoute("/api/v1/heatmap/hotspots");
  }

  private initRoute(route: string): void {
    this.routes.set(route, {
      counters: {
        ok: 0,
        error: 0,
        badRequest: 0,
        timeout: 0,
        cacheHit: 0,
        cacheMiss: 0
      },
      latency: {
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        buckets: {
          "<250": 0,
          "<500": 0,
          "<1000": 0,
          "<2000": 0,
          ">=2000": 0
        }
      },
      durations: []
    });
  }

  private getRouteMetrics(route: string): RouteMetrics {
    if (!this.routes.has(route)) {
      this.initRoute(route);
    }
    return this.routes.get(route)!;
  }

  incrementCounter(route: string, counter: keyof RouteCounters): void {
    const metrics = this.getRouteMetrics(route);
    metrics.counters[counter]++;
  }

  recordDuration(route: string, durationMs: number): void {
    const metrics = this.getRouteMetrics(route);
    
    // Update buckets
    if (durationMs < 250) metrics.latency.buckets["<250"]++;
    else if (durationMs < 500) metrics.latency.buckets["<500"]++;
    else if (durationMs < 1000) metrics.latency.buckets["<1000"]++;
    else if (durationMs < 2000) metrics.latency.buckets["<2000"]++;
    else metrics.latency.buckets[">=2000"]++;

    // Update ring buffer
    metrics.durations.push(durationMs);
    if (metrics.durations.length > this.maxDurations) {
      metrics.durations.shift();
    }

    // Recalculate percentiles
    this.calculatePercentiles(metrics);
  }

  private calculatePercentiles(metrics: RouteMetrics): void {
    const sorted = [...metrics.durations].sort((a, b) => a - b);
    const len = sorted.length;
    
    if (len === 0) return;

    metrics.latency.p50 = this.percentile(sorted, 0.5);
    metrics.latency.p90 = this.percentile(sorted, 0.9);
    metrics.latency.p95 = this.percentile(sorted, 0.95);
    metrics.latency.p99 = this.percentile(sorted, 0.99);
  }

  private percentile(sorted: number[], p: number): number {
    const index = p * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  getMetrics(): Record<string, RouteMetrics> {
    const result: Record<string, RouteMetrics> = {};
    for (const [route, metrics] of this.routes) {
      result[route] = {
        ...metrics,
        durations: undefined as any // Don't expose raw durations
      };
    }
    return result;
  }

  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

// Cache stats helper
export function getCacheStats(): CacheStats {
  // This will be integrated with hotspotsCache.ts
  return {
    entries: 0,
    hits: 0,
    misses: 0,
    hitRatio: 0.0,
    avgAgeMs: 0
  };
}
