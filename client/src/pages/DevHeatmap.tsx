
import React, { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { requestJson } from "@/utils/http";

interface RequestLogEntry {
  id: string;
  timestamp: string;
  endpoint: string;
  status: number;
  durationMs: number;
  requestBody: any;
  responseSnippet: string;
  showDetails: boolean;
}

interface HeatmapResponse {
  base64?: string;
  meta?: any;
  reqId?: string;
  [key: string]: any;
}

const DEFAULT_DATA_POINTS = `[
  { "x": 0.32, "y": 0.18, "type": "click" },
  { "x": 0.50, "y": 0.42, "type": "move" },
  { "x": 0.68, "y": 0.27, "type": "move" },
  { "x": 0.51, "y": 0.66, "type": "click" },
  { "x": 0.40, "y": 0.82, "type": "move" }
]`;

export default function DevHeatmap() {
  // AI Panel State
  const [aiUrl, setAiUrl] = useState("https://www.acquisition.com/");
  const [aiDevice, setAiDevice] = useState("desktop");
  const [aiPersist, setAiPersist] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const aiAbortRef = useRef<AbortController | null>(null);

  // Data Panel State
  const [dataUrl, setDataUrl] = useState("https://www.acquisition.com/");
  const [dataDevice, setDataDevice] = useState("desktop");
  const [dataPoints, setDataPoints] = useState(DEFAULT_DATA_POINTS);
  const [dataPersist, setDataPersist] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [dataPointsError, setDataPointsError] = useState("");
  const dataAbortRef = useRef<AbortController | null>(null);

  // Console State
  const [currentResponse, setCurrentResponse] = useState<HeatmapResponse | null>(null);
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([]);

  // Load persisted data on mount
  useEffect(() => {
    if (aiPersist) {
      const saved = localStorage.getItem("heatmap_dev_ai_form");
      if (saved) {
        try {
          const { url, device } = JSON.parse(saved);
          if (url) setAiUrl(url);
          if (device) setAiDevice(device);
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, [aiPersist]);

  useEffect(() => {
    if (dataPersist) {
      const saved = localStorage.getItem("heatmap_dev_data_form");
      if (saved) {
        try {
          const { url, device, dataPoints: savedPoints } = JSON.parse(saved);
          if (url) setDataUrl(url);
          if (device) setDataDevice(device);
          if (savedPoints) setDataPoints(savedPoints);
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }, [dataPersist]);

  // Save to localStorage when persist is enabled
  useEffect(() => {
    if (aiPersist) {
      localStorage.setItem("heatmap_dev_ai_form", JSON.stringify({
        url: aiUrl,
        device: aiDevice,
      }));
    }
  }, [aiPersist, aiUrl, aiDevice]);

  useEffect(() => {
    if (dataPersist) {
      localStorage.setItem("heatmap_dev_data_form", JSON.stringify({
        url: dataUrl,
        device: dataDevice,
        dataPoints,
      }));
    }
  }, [dataPersist, dataUrl, dataDevice, dataPoints]);

  const validateUrl = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const validateDataPoints = (points: string): boolean => {
    try {
      const parsed = JSON.parse(points);
      return Array.isArray(parsed);
    } catch {
      return false;
    }
  };

  const addToRequestLog = (entry: Omit<RequestLogEntry, "id" | "showDetails">) => {
    const newEntry: RequestLogEntry = {
      ...entry,
      id: Date.now().toString(),
      showDetails: false,
    };
    setRequestLog(prev => [newEntry, ...prev.slice(0, 4)]);
  };

  const truncateBase64 = (obj: any): any => {
    if (typeof obj !== "object" || obj === null) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(truncateBase64);
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "base64" && typeof value === "string" && value.startsWith("data:image/")) {
        const length = value.length;
        const prefix = value.substring(0, 64);
        result[key] = `<length: ${length.toLocaleString()} bytes>; prefix: ${prefix}...`;
      } else if (typeof value === "object") {
        result[key] = truncateBase64(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  const handleAiGenerate = async () => {
    if (!validateUrl(aiUrl)) {
      setAiError("URL must start with http:// or https://");
      return;
    }
    setAiError("");

    // Abort previous request
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }

    aiAbortRef.current = new AbortController();
    setAiLoading(true);

    try {
      const response = await requestJson<HeatmapResponse>({
        url: "/api/v1/heatmap",
        method: "POST",
        body: { url: aiUrl, device: aiDevice },
        signal: aiAbortRef.current.signal,
      });

      setCurrentResponse(response.data);
      setCurrentMeta({
        reqId: response.data.reqId,
        status: response.status,
        durationMs: response.durationMs,
        ...response.data.meta,
      });

      addToRequestLog({
        timestamp: new Date().toISOString(),
        endpoint: "POST /api/v1/heatmap",
        status: response.status,
        durationMs: response.durationMs,
        requestBody: { url: aiUrl, device: aiDevice },
        responseSnippet: JSON.stringify(truncateBase64(response.data)).substring(0, 200),
      });
    } catch (error: any) {
      if (error.error !== "ABORTED") {
        setAiError(`Request failed: ${error.error || "Unknown error"}`);
        addToRequestLog({
          timestamp: new Date().toISOString(),
          endpoint: "POST /api/v1/heatmap",
          status: error.status || 0,
          durationMs: error.durationMs || 0,
          requestBody: { url: aiUrl, device: aiDevice },
          responseSnippet: `Error: ${error.error}`,
        });
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleDataGenerate = async () => {
    if (!validateUrl(dataUrl)) {
      setDataError("URL must start with http:// or https://");
      return;
    }
    if (!validateDataPoints(dataPoints)) {
      setDataPointsError("Data points must be valid JSON array");
      return;
    }
    setDataError("");
    setDataPointsError("");

    // Abort previous request
    if (dataAbortRef.current) {
      dataAbortRef.current.abort();
    }

    dataAbortRef.current = new AbortController();
    setDataLoading(true);

    try {
      const parsedDataPoints = JSON.parse(dataPoints);
      const response = await requestJson<HeatmapResponse>({
        url: "/api/v1/heatmap/data",
        method: "POST",
        body: { url: dataUrl, device: dataDevice, dataPoints: parsedDataPoints },
        signal: dataAbortRef.current.signal,
      });

      setCurrentResponse(response.data);
      setCurrentMeta({
        reqId: response.data.reqId,
        status: response.status,
        durationMs: response.durationMs,
        ...response.data.meta,
      });

      addToRequestLog({
        timestamp: new Date().toISOString(),
        endpoint: "POST /api/v1/heatmap/data",
        status: response.status,
        durationMs: response.durationMs,
        requestBody: { url: dataUrl, device: dataDevice, dataPoints: parsedDataPoints },
        responseSnippet: JSON.stringify(truncateBase64(response.data)).substring(0, 200),
      });
    } catch (error: any) {
      if (error.error !== "ABORTED") {
        setDataError(`Request failed: ${error.error || "Unknown error"}`);
        addToRequestLog({
          timestamp: new Date().toISOString(),
          endpoint: "POST /api/v1/heatmap/data",
          status: error.status || 0,
          durationMs: error.durationMs || 0,
          requestBody: { url: dataUrl, device: dataDevice, dataPoints: dataPoints },
          responseSnippet: `Error: ${error.error}`,
        });
      }
    } finally {
      setDataLoading(false);
    }
  };

  const handleDiagnostic = async (endpoint: string) => {
    try {
      const response = await requestJson({
        url: endpoint,
        method: "GET",
      });

      setCurrentResponse(response.data);
      setCurrentMeta({
        status: response.status,
        durationMs: response.durationMs,
      });

      addToRequestLog({
        timestamp: new Date().toISOString(),
        endpoint: `GET ${endpoint}`,
        status: response.status,
        durationMs: response.durationMs,
        requestBody: null,
        responseSnippet: JSON.stringify(response.data).substring(0, 200),
      });
    } catch (error: any) {
      addToRequestLog({
        timestamp: new Date().toISOString(),
        endpoint: `GET ${endpoint}`,
        status: error.status || 0,
        durationMs: error.durationMs || 0,
        requestBody: null,
        responseSnippet: `Error: ${error.error}`,
      });
    }
  };

  const handleCopyBase64 = () => {
    if (currentResponse?.base64) {
      navigator.clipboard.writeText(currentResponse.base64);
    }
  };

  const handleDownloadPng = () => {
    if (currentResponse?.base64) {
      const link = document.createElement("a");
      link.href = currentResponse.base64;
      link.download = `heatmap-${Date.now()}.png`;
      link.click();
    }
  };

  const handleAiReset = () => {
    setAiUrl("https://www.acquisition.com/");
    setAiDevice("desktop");
    setAiError("");
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }
  };

  const handleDataReset = () => {
    setDataUrl("https://www.acquisition.com/");
    setDataDevice("desktop");
    setDataPoints(DEFAULT_DATA_POINTS);
    setDataError("");
    setDataPointsError("");
    if (dataAbortRef.current) {
      dataAbortRef.current.abort();
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Heatmap Dev UI</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Forms */}
        <div className="space-y-6">
          {/* AI Heatmap Panel */}
          <Card className="rounded-xl border p-4">
            <h2 className="font-semibold mb-4">AI Heatmap — /api/v1/heatmap</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="ai-url">URL</Label>
                <Input
                  id="ai-url"
                  value={aiUrl}
                  onChange={(e) => {
                    setAiUrl(e.target.value);
                    setAiError("");
                  }}
                  placeholder="https://example.com"
                />
                {aiError && <p className="text-red-500 text-sm mt-1">{aiError}</p>}
              </div>

              <div>
                <Label htmlFor="ai-device">Device</Label>
                <Select value={aiDevice} onValueChange={setAiDevice}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desktop">Desktop</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ai-persist"
                  checked={aiPersist}
                  onCheckedChange={setAiPersist}
                />
                <Label htmlFor="ai-persist">Persist form data</Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={handleAiReset}>
                  Reset
                </Button>
                <Button 
                  onClick={handleAiGenerate} 
                  disabled={aiLoading}
                >
                  {aiLoading ? "Generating..." : "Generate AI Heatmap"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Data Heatmap Panel */}
          <Card className="rounded-xl border p-4">
            <h2 className="font-semibold mb-4">Data Heatmap — /api/v1/heatmap/data</h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="data-url">URL</Label>
                <Input
                  id="data-url"
                  value={dataUrl}
                  onChange={(e) => {
                    setDataUrl(e.target.value);
                    setDataError("");
                  }}
                  placeholder="https://example.com"
                />
                {dataError && <p className="text-red-500 text-sm mt-1">{dataError}</p>}
              </div>

              <div>
                <Label htmlFor="data-device">Device</Label>
                <Select value={dataDevice} onValueChange={setDataDevice}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desktop">Desktop</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="data-points">Data Points (JSON)</Label>
                <Textarea
                  id="data-points"
                  value={dataPoints}
                  onChange={(e) => {
                    setDataPoints(e.target.value);
                    setDataPointsError("");
                  }}
                  rows={8}
                  className="font-mono text-sm"
                />
                {dataPointsError && <p className="text-red-500 text-sm mt-1">{dataPointsError}</p>}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="data-persist"
                  checked={dataPersist}
                  onCheckedChange={setDataPersist}
                />
                <Label htmlFor="data-persist">Persist form data</Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={handleDataReset}>
                  Reset
                </Button>
                <Button 
                  onClick={handleDataGenerate} 
                  disabled={dataLoading}
                >
                  {dataLoading ? "Generating..." : "Generate Data Heatmap"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Diagnostics Panel */}
          <Card className="rounded-xl border p-4">
            <h2 className="font-semibold mb-4">Diagnostics</h2>
            
            <div className="flex space-x-2">
              <Button 
                variant="outline"
                onClick={() => handleDiagnostic("/health")}
              >
                GET /health
              </Button>
              <Button 
                variant="outline"
                onClick={() => handleDiagnostic("/api/v1/heatmap/diagnostics")}
              >
                GET /api/v1/heatmap/diagnostics
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column - Console */}
        <div className="space-y-6">
          <Card className="rounded-xl border p-4">
            <h2 className="font-semibold mb-4">Console</h2>

            {/* Image Preview */}
            <div className="mb-4">
              <h3 className="font-medium mb-2">Image Preview</h3>
              <div className="border rounded-lg p-4 max-h-96 overflow-auto">
                {currentResponse?.base64 ? (
                  <img 
                    src={currentResponse.base64} 
                    alt="Generated heatmap"
                    className="max-w-full h-auto"
                  />
                ) : (
                  <div className="text-gray-500 text-center py-8">
                    No image to display
                  </div>
                )}
              </div>
            </div>

            {/* Meta Summary */}
            {currentMeta && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Meta Summary</h3>
                <div className="bg-gray-50 rounded p-3 text-sm">
                  <div><strong>Status:</strong> {currentMeta.status}</div>
                  <div><strong>Duration:</strong> {currentMeta.durationMs}ms</div>
                  {currentMeta.reqId && <div><strong>Request ID:</strong> {currentMeta.reqId}</div>}
                  {currentMeta.phase && <div><strong>Phase:</strong> {currentMeta.phase}</div>}
                  {currentMeta.engine && <div><strong>Engine:</strong> {currentMeta.engine}</div>}
                  {currentMeta.viewport && (
                    <div><strong>Viewport:</strong> {currentMeta.viewport.width}x{currentMeta.viewport.height}</div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            {currentResponse?.base64 && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Actions</h3>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={handleCopyBase64}>
                    Copy base64
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadPng}>
                    Download PNG
                  </Button>
                </div>
              </div>
            )}

            {/* Raw JSON Response */}
            {currentResponse && (
              <div className="mb-4">
                <h3 className="font-medium mb-2">Raw JSON (Response)</h3>
                <pre className="font-mono text-sm whitespace-pre overflow-auto bg-gray-50 rounded p-3 max-h-64">
                  {JSON.stringify(truncateBase64(currentResponse), null, 2)}
                </pre>
              </div>
            )}

            {/* Request Log */}
            <div>
              <h3 className="font-medium mb-2">Request Log (Last 5)</h3>
              <div className="space-y-2">
                {requestLog.map((entry) => (
                  <div key={entry.id} className="border rounded p-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{entry.endpoint}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        entry.status >= 200 && entry.status < 300 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      {new Date(entry.timestamp).toLocaleTimeString()} • {entry.durationMs}ms
                    </div>
                    <div className="mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRequestLog(prev => prev.map(e => 
                            e.id === entry.id ? { ...e, showDetails: !e.showDetails } : e
                          ));
                        }}
                      >
                        {entry.showDetails ? "Hide" : "Show"} details
                      </Button>
                    </div>
                    {entry.showDetails && (
                      <div className="mt-2 space-y-2">
                        {entry.requestBody && (
                          <div>
                            <strong>Request:</strong>
                            <pre className="font-mono text-xs bg-gray-100 p-2 rounded mt-1">
                              {JSON.stringify(entry.requestBody, null, 2)}
                            </pre>
                          </div>
                        )}
                        <div>
                          <strong>Response snippet:</strong>
                          <pre className="font-mono text-xs bg-gray-100 p-2 rounded mt-1">
                            {entry.responseSnippet}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {requestLog.length === 0 && (
                  <div className="text-gray-500 text-center py-4">No requests yet</div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
