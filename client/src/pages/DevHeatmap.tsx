
import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { requestJson } from "../utils/http";

interface RequestLog {
  id: string;
  endpoint: string;
  status: number;
  durationMs: number;
  timestamp: string;
}

const defaultDataPoints = `[
  { "x": 0.32, "y": 0.18, "type": "click" },
  { "x": 0.50, "y": 0.42, "type": "move"  },
  { "x": 0.68, "y": 0.27, "type": "move"  },
  { "x": 0.51, "y": 0.66, "type": "click" },
  { "x": 0.40, "y": 0.82, "type": "move"  }
]`;

export default function DevHeatmap() {
  // AI Heatmap form state
  const [aiForm, setAiForm] = useState({
    url: "https://example.com",
    device: "desktop",
    persist: false
  });

  // Data Heatmap form state
  const [dataForm, setDataForm] = useState({
    url: "https://example.com",
    device: "desktop",
    dataPoints: defaultDataPoints,
    persist: false
  });

  // Console state
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [currentRawJson, setCurrentRawJson] = useState<string>("");
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Abort controller for canceling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load persisted forms on mount
  useEffect(() => {
    const savedAiForm = localStorage.getItem("heatmap_dev_ai_form");
    if (savedAiForm) {
      try {
        const parsed = JSON.parse(savedAiForm);
        setAiForm(prev => ({ ...prev, ...parsed }));
      } catch {}
    }

    const savedDataForm = localStorage.getItem("heatmap_dev_data_form");
    if (savedDataForm) {
      try {
        const parsed = JSON.parse(savedDataForm);
        setDataForm(prev => ({ ...prev, ...parsed }));
      } catch {}
    }
  }, []);

  // Persist forms when they change
  useEffect(() => {
    if (aiForm.persist) {
      localStorage.setItem("heatmap_dev_ai_form", JSON.stringify(aiForm));
    }
  }, [aiForm]);

  useEffect(() => {
    if (dataForm.persist) {
      localStorage.setItem("heatmap_dev_data_form", JSON.stringify(dataForm));
    }
  }, [dataForm]);

  const validateUrl = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const validateDataPoints = (jsonStr: string): boolean => {
    try {
      const points = JSON.parse(jsonStr);
      if (!Array.isArray(points)) return false;
      return points.every(p => 
        typeof p.x === "number" && p.x >= 0 && p.x <= 1 &&
        typeof p.y === "number" && p.y >= 0 && p.y <= 1
      );
    } catch {
      return false;
    }
  };

  const addRequestLog = (endpoint: string, status: number, durationMs: number) => {
    const log: RequestLog = {
      id: Date.now().toString(),
      endpoint,
      status,
      durationMs,
      timestamp: new Date().toISOString()
    };
    setRequestLogs(prev => [log, ...prev.slice(0, 4)]);
  };

  const abortPreviousRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
  };

  const handleAiHeatmap = async () => {
    if (!validateUrl(aiForm.url)) {
      alert("URL must start with http:// or https://");
      return;
    }

    abortPreviousRequest();
    setLoading(true);

    try {
      const result = await requestJson({
        url: "/api/v1/heatmap",
        method: "POST",
        body: {
          url: aiForm.url,
          device: aiForm.device
        },
        signal: abortControllerRef.current?.signal
      });

      addRequestLog("/api/v1/heatmap", result.status, result.durationMs);

      if (result.status === 200 && result.data?.base64) {
        setCurrentImage(result.data.base64);
        setCurrentMeta(result.data.meta);
        
        // Truncate base64 for raw JSON display
        const truncatedData = {
          ...result.data,
          base64: `${result.data.base64.substring(0, 50)}... (${result.data.base64.length} chars)`
        };
        setCurrentRawJson(JSON.stringify(truncatedData, null, 2));
      } else {
        setCurrentRawJson(JSON.stringify(result.data, null, 2));
        setCurrentImage(null);
        setCurrentMeta(null);
      }
    } catch (err: any) {
      console.error("AI Heatmap error:", err);
      addRequestLog("/api/v1/heatmap", err.status || 0, err.durationMs || 0);
      setCurrentRawJson(JSON.stringify({ error: err.error || "Request failed" }, null, 2));
      setCurrentImage(null);
      setCurrentMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDataHeatmap = async () => {
    if (!validateUrl(dataForm.url)) {
      alert("URL must start with http:// or https://");
      return;
    }

    if (!validateDataPoints(dataForm.dataPoints)) {
      alert("Invalid dataPoints JSON. Ensure x,y values are between 0 and 1.");
      return;
    }

    abortPreviousRequest();
    setLoading(true);

    try {
      const result = await requestJson({
        url: "/api/v1/heatmap/data",
        method: "POST",
        body: {
          url: dataForm.url,
          device: dataForm.device,
          dataPoints: JSON.parse(dataForm.dataPoints)
        },
        signal: abortControllerRef.current?.signal
      });

      addRequestLog("/api/v1/heatmap/data", result.status, result.durationMs);

      if (result.status === 200 && result.data?.base64) {
        setCurrentImage(result.data.base64);
        setCurrentMeta(result.data.meta);
        
        // Truncate base64 for raw JSON display
        const truncatedData = {
          ...result.data,
          base64: `${result.data.base64.substring(0, 50)}... (${result.data.base64.length} chars)`
        };
        setCurrentRawJson(JSON.stringify(truncatedData, null, 2));
      } else {
        setCurrentRawJson(JSON.stringify(result.data, null, 2));
        setCurrentImage(null);
        setCurrentMeta(null);
      }
    } catch (err: any) {
      console.error("Data Heatmap error:", err);
      addRequestLog("/api/v1/heatmap/data", err.status || 0, err.durationMs || 0);
      setCurrentRawJson(JSON.stringify({ error: err.error || "Request failed" }, null, 2));
      setCurrentImage(null);
      setCurrentMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDiagnostics = async (endpoint: string) => {
    try {
      const result = await requestJson({
        url: endpoint,
        method: "GET"
      });
      
      addRequestLog(endpoint, result.status, result.durationMs);
      console.log(`[${endpoint}]`, result.data);
      setCurrentRawJson(JSON.stringify(result.data, null, 2));
    } catch (err: any) {
      console.error(`Diagnostics error [${endpoint}]:`, err);
      addRequestLog(endpoint, err.status || 0, err.durationMs || 0);
    }
  };

  const copyBase64 = () => {
    if (currentImage) {
      navigator.clipboard.writeText(currentImage);
      alert("Base64 copied to clipboard");
    }
  };

  const downloadPng = () => {
    if (currentImage) {
      const link = document.createElement("a");
      link.href = currentImage;
      link.download = `heatmap-${Date.now()}.png`;
      link.click();
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Heatmap Dev Console</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Forms */}
        <div className="space-y-6">
          {/* AI Heatmap Panel */}
          <Card>
            <CardHeader>
              <CardTitle>AI Heatmap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ai-url">URL</Label>
                <Input
                  id="ai-url"
                  value={aiForm.url}
                  onChange={(e) => setAiForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              
              <div>
                <Label htmlFor="ai-device">Device</Label>
                <Select value={aiForm.device} onValueChange={(value) => setAiForm(prev => ({ ...prev, device: value }))}>
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
                  checked={aiForm.persist}
                  onCheckedChange={(checked) => setAiForm(prev => ({ ...prev, persist: !!checked }))}
                />
                <Label htmlFor="ai-persist">Persist form</Label>
              </div>

              <Button onClick={handleAiHeatmap} disabled={loading} className="w-full">
                Generate AI Heatmap
              </Button>
            </CardContent>
          </Card>

          {/* Data Heatmap Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Data Heatmap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="data-url">URL</Label>
                <Input
                  id="data-url"
                  value={dataForm.url}
                  onChange={(e) => setDataForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              
              <div>
                <Label htmlFor="data-device">Device</Label>
                <Select value={dataForm.device} onValueChange={(value) => setDataForm(prev => ({ ...prev, device: value }))}>
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
                  value={dataForm.dataPoints}
                  onChange={(e) => setDataForm(prev => ({ ...prev, dataPoints: e.target.value }))}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="data-persist"
                  checked={dataForm.persist}
                  onCheckedChange={(checked) => setDataForm(prev => ({ ...prev, persist: !!checked }))}
                />
                <Label htmlFor="data-persist">Persist form</Label>
              </div>

              <Button onClick={handleDataHeatmap} disabled={loading} className="w-full">
                Generate Data Heatmap
              </Button>
            </CardContent>
          </Card>

          {/* Diagnostics Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Diagnostics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                onClick={() => handleDiagnostics("/health")}
                className="w-full"
              >
                Health Check
              </Button>
              <Button 
                variant="outline" 
                onClick={() => handleDiagnostics("/api/v1/heatmap/diagnostics")}
                className="w-full"
              >
                Heatmap Diagnostics
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Console */}
        <div className="space-y-6">
          {/* Image Display */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Image</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && <div className="text-center py-8">Generating heatmap...</div>}
              {currentImage && !loading && (
                <div className="space-y-4">
                  <img src={currentImage} alt="Generated heatmap" className="w-full border rounded" />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={copyBase64} size="sm">
                      Copy Base64
                    </Button>
                    <Button variant="outline" onClick={downloadPng} size="sm">
                      Download PNG
                    </Button>
                  </div>
                </div>
              )}
              {!currentImage && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  No image generated yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Meta Information */}
          {currentMeta && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><strong>Engine:</strong> {currentMeta.engine}</div>
                  <div><strong>Device:</strong> {currentMeta.device}</div>
                  <div><strong>Duration:</strong> {currentMeta.durationMs}ms</div>
                  <div><strong>Phase:</strong> {currentMeta.phase}</div>
                  {currentMeta.viewport && (
                    <div><strong>Viewport:</strong> {currentMeta.viewport.width}x{currentMeta.viewport.height}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Raw JSON */}
          <Card>
            <CardHeader>
              <CardTitle>Raw Response</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-60">
                {currentRawJson || "No response yet"}
              </pre>
            </CardContent>
          </Card>

          {/* Request Log */}
          <Card>
            <CardHeader>
              <CardTitle>Request Log (Last 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {requestLogs.map(log => (
                  <div key={log.id} className="flex justify-between items-center text-sm p-2 bg-muted rounded">
                    <span>{log.endpoint}</span>
                    <div className="flex gap-2">
                      <span className={log.status >= 200 && log.status < 300 ? "text-green-600" : "text-red-600"}>
                        {log.status}
                      </span>
                      <span>{log.durationMs}ms</span>
                    </div>
                  </div>
                ))}
                {requestLogs.length === 0 && (
                  <div className="text-center text-muted-foreground">No requests yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
