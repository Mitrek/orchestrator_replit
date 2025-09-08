
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

interface DiagnosticsData {
  phase: string;
  uptimeSec: number;
  timestamp: string;
  version: string;
  featureFlags: Record<string, boolean>;
  env: {
    node: string;
    openaiConfigured: boolean;
    provider: string;
    providerConfigured: boolean;
  };
  metrics: {
    routes: Record<string, any>;
    cache: {
      entries: number;
      hitRatio: number;
      avgAgeMs: number;
    };
  };
  providers: {
    screenshot: { active: boolean; lastError: string | null };
    ai: { active: boolean; lastError: string | null; lastModel?: string };
  };
  recentErrors: Array<{
    ts: string;
    route: string;
    errType: string;
    message: string;
  }>;
  qa?: Record<string, any>;
}

export default function DevDiagnostics() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [qaData, setQaData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [qaLoading, setQaLoading] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/heatmap/diagnostics');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  const runQA = async () => {
    setQaLoading(true);
    try {
      const response = await fetch('/api/v1/heatmap/diagnostics?qa=1');
      const result = await response.json();
      setQaData(result.qa);
    } catch (error) {
      console.error('Failed to run QA:', error);
    } finally {
      setQaLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  if (!data) {
    return <div className="p-6">Loading diagnostics...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">System Diagnostics</h1>
        <div className="space-x-2">
          <Button onClick={fetchDiagnostics} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={runQA} disabled={qaLoading} variant="outline">
            {qaLoading ? 'Running QA...' : 'Run Golden QA'}
          </Button>
        </div>
      </div>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-500">Phase</div>
              <Badge>{data.phase}</Badge>
            </div>
            <div>
              <div className="text-sm text-gray-500">Uptime</div>
              <div>{Math.floor(data.uptimeSec / 60)} minutes</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Version</div>
              <div>{data.version}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Node</div>
              <div>{data.env.node}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.featureFlags).map(([key, value]) => (
              <Badge key={key} variant={value ? "default" : "secondary"}>
                {key}: {value ? "enabled" : "disabled"}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Providers */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span>Screenshot ({data.env.provider})</span>
              <div className="flex items-center gap-2">
                <Badge variant={data.providers.screenshot.active ? "default" : "destructive"}>
                  {data.providers.screenshot.active ? "Active" : "Inactive"}
                </Badge>
                {data.providers.screenshot.lastError && (
                  <span className="text-sm text-red-500">{data.providers.screenshot.lastError}</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span>AI ({data.providers.ai.lastModel || "unknown"})</span>
              <div className="flex items-center gap-2">
                <Badge variant={data.providers.ai.active ? "default" : "destructive"}>
                  {data.providers.ai.active ? "Active" : "Inactive"}
                </Badge>
                {data.providers.ai.lastError && (
                  <span className="text-sm text-red-500">{data.providers.ai.lastError}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Route Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(data.metrics.routes).map(([route, metrics]: [string, any]) => (
              <div key={route} className="border-b pb-3">
                <h4 className="font-medium">{route}</h4>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2 text-sm">
                  <div>OK: {metrics.counters.ok}</div>
                  <div>Error: {metrics.counters.error}</div>
                  <div>Bad Request: {metrics.counters.badRequest}</div>
                  <div>Cache Hit: {metrics.counters.cacheHit}</div>
                  <div>Cache Miss: {metrics.counters.cacheMiss}</div>
                  <div>P95: {metrics.latency.p95.toFixed(0)}ms</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cache Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Cache Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500">Entries</div>
              <div className="text-2xl font-bold">{data.metrics.cache.entries}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Hit Ratio</div>
              <div className="text-2xl font-bold">{(data.metrics.cache.hitRatio * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Avg Age</div>
              <div className="text-2xl font-bold">{Math.floor(data.metrics.cache.avgAgeMs / 1000)}s</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QA Results */}
      {qaData && (
        <Card>
          <CardHeader>
            <CardTitle>Golden QA Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(qaData).map(([device, result]: [string, any]) => (
                <div key={device} className="flex items-center justify-between">
                  <span>{device}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={result.pass ? "default" : "destructive"}>
                      {result.pass ? "Pass" : "Fail"}
                    </Badge>
                    {result.psnr > 0 && <span className="text-sm">PSNR: {result.psnr.toFixed(1)}dB</span>}
                    {result.reason && <span className="text-sm text-gray-500">{result.reason}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Errors */}
      {data.recentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentErrors.map((error, index) => (
                <div key={index} className="p-2 bg-red-50 rounded text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{error.route}</span>
                    <span className="text-gray-500">{new Date(error.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-red-600">{error.errType}: {error.message}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
