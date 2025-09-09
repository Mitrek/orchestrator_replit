
import React, { useState, useRef, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { requestJson } from "../utils/http";

interface RequestLog {
  timestamp: string;
  endpoint: string;
  status: number;
  durationMs: number;
  requestBody: any;
  responseSnippet: string;
  fullResponse: any;
}

interface HeatmapResponse {
  base64?: string;
  url?: string;
  meta?: {
    phase?: string;
    engine?: string;
    viewport?: { width: number; height: number };
    reqId?: string;
  };
}

export default function DevHeatmap() {
  // AI Panel state
  const [url, setUrl] = useState("https://www.acquisition.com/");
  const [device, setDevice] = useState("desktop");
  const [returnMode, setReturnMode] = useState("base64");
  const [persist, setPersist] = useState(false);
  
  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [currentResponse, setCurrentResponse] = useState<HeatmapResponse | null>(null);
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [requestLog, setRequestLog] = useState<RequestLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persistence
  useEffect(() => {
    if (persist) {
      const stored = localStorage.getItem("heatmap_dev_ai_form");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setUrl(parsed.url || "https://www.acquisition.com/");
          setDevice(parsed.device || "desktop");
          setReturnMode(parsed.returnMode || "base64");
        } catch {}
      }
    }
  }, [persist]);

  useEffect(() => {
    if (persist) {
      localStorage.setItem("heatmap_dev_ai_form", JSON.stringify({
        url,
        device,
        returnMode,
      }));
    }
  }, [url, device, returnMode, persist]);

  // Validation
  const validateUrl = (urlString: string): boolean => {
    if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
      setUrlError("URL must start with http:// or https://");
      return false;
    }
    setUrlError("");
    return true;
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    if (urlError) {
      validateUrl(newUrl);
    }
  };

  const addToRequestLog = (entry: RequestLog) => {
    setRequestLog(prev => [entry, ...prev.slice(0, 4)]);
  };

  const handleGenerate = async () => {
    if (!validateUrl(url)) return;

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setCurrentResponse(null);
    setCurrentMeta(null);

    const requestBody = { url, device, returnMode };

    try {
      const result = await requestJson<HeatmapResponse>({
        url: "/api/v1/heatmap",
        method: "POST",
        body: requestBody,
        signal: abortController.signal,
      });

      if (result.status >= 400) {
        // Error case
        setCurrentMeta({
          status: result.status,
          durationMs: result.durationMs,
          error: true,
        });
      } else {
        // Success case
        let processedResponse = { ...result.data };
        
        // Handle base64 prefix
        if (processedResponse.base64 && !processedResponse.base64.startsWith("data:")) {
          processedResponse.base64 = `data:image/png;base64,${processedResponse.base64}`;
        }

        setCurrentResponse(processedResponse);
        setCurrentMeta({
          reqId: processedResponse.meta?.reqId || "—",
          phase: processedResponse.meta?.phase || "—",
          engine: processedResponse.meta?.engine || "—",
          viewport: processedResponse.meta?.viewport 
            ? `${processedResponse.meta.viewport.width} × ${processedResponse.meta.viewport.height}`
            : "—",
          durationMs: result.durationMs,
          status: result.status,
        });
      }

      // Add to request log
      addToRequestLog({
        timestamp: new Date().toISOString(),
        endpoint: "/api/v1/heatmap",
        status: result.status,
        durationMs: result.durationMs,
        requestBody,
        responseSnippet: JSON.stringify(result.data).slice(0, 200),
        fullResponse: result.data,
      });

    } catch (error: any) {
      if (error.error !== "ABORTED") {
        setCurrentMeta({
          status: error.status || 0,
          durationMs: error.durationMs || 0,
          error: true,
        });

        addToRequestLog({
          timestamp: new Date().toISOString(),
          endpoint: "/api/v1/heatmap",
          status: error.status || 0,
          durationMs: error.durationMs || 0,
          requestBody,
          responseSnippet: error.error || "Network error",
          fullResponse: { error: error.error },
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setUrl("https://www.acquisition.com/");
    setDevice("desktop");
    setReturnMode("base64");
    setUrlError("");
    setCurrentResponse(null);
    setCurrentMeta(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-6">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - AI Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">AI Heatmap — /api/v1/heatmap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <Input
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://example.com"
                />
                {urlError && (
                  <p className="text-red-600 text-sm mt-1">{urlError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Device</label>
                <Select value={device} onValueChange={setDevice}>
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
                <label className="block text-sm font-medium mb-1">Return Mode</label>
                <Select value={returnMode} onValueChange={setReturnMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base64">Base64</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="persist" 
                  checked={persist} 
                  onCheckedChange={setPersist}
                />
                <label htmlFor="persist" className="text-sm font-medium">
                  Persist
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="ghost" onClick={handleReset}>
                  Reset
                </Button>
                <Button 
                  onClick={handleGenerate} 
                  disabled={isGenerating}
                >
                  {isGenerating ? "Generating..." : "Generate AI Heatmap"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel - Console */}
          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">Console</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Image Preview */}
              <div>
                <h3 className="font-medium mb-2">Image Preview</h3>
                <div className="border rounded p-2 max-h-64 overflow-auto bg-gray-50">
                  {currentResponse ? (
                    <div>
                      {currentResponse.base64 && (
                        <img 
                          src={currentResponse.base64} 
                          alt="Heatmap" 
                          className="max-w-full h-auto"
                        />
                      )}
                      {currentResponse.url && (
                        <div className="mt-2">
                          {!currentResponse.base64 && (
                            <img 
                              src={currentResponse.url} 
                              alt="Heatmap" 
                              className="max-w-full h-auto"
                            />
                          )}
                          <a 
                            href={currentResponse.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Open
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No image to display</p>
                  )}
                </div>
              </div>

              {/* Meta Summary */}
              <div>
                <h3 className="font-medium mb-2">Meta Summary</h3>
                <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                  {currentMeta ? (
                    <>
                      <div><strong>reqId:</strong> {currentMeta.reqId}</div>
                      <div><strong>phase:</strong> {currentMeta.phase}</div>
                      <div><strong>engine:</strong> {currentMeta.engine}</div>
                      <div><strong>viewport:</strong> {currentMeta.viewport}</div>
                      <div><strong>durationMs:</strong> {currentMeta.durationMs}</div>
                      <div><strong>status:</strong> {currentMeta.status}</div>
                    </>
                  ) : (
                    <p className="text-gray-500">No metadata available</p>
                  )}
                </div>
              </div>

              {/* Raw Response JSON */}
              <div>
                <h3 className="font-medium mb-2">Raw Response JSON</h3>
                <pre className="bg-gray-50 p-3 rounded text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                  {currentResponse ? JSON.stringify(currentResponse, null, 2) : "No response data"}
                </pre>
              </div>

              {/* Requests Log */}
              <div>
                <h3 className="font-medium mb-2">Requests (last 5)</h3>
                <div className="space-y-2">
                  {requestLog.length === 0 ? (
                    <p className="text-gray-500 text-sm">No requests yet</p>
                  ) : (
                    requestLog.map((log, index) => (
                      <div key={index} className="border rounded p-2 text-sm">
                        <div className="flex justify-between items-center">
                          <div className="space-x-4">
                            <span className="font-mono text-xs">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="font-medium">{log.endpoint}</span>
                            <span className={`px-1 rounded text-xs ${
                              log.status >= 400 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {log.status}
                            </span>
                            <span className="text-gray-600">{log.durationMs}ms</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setExpandedLog(expandedLog === index ? null : index)}
                          >
                            {expandedLog === index ? "−" : "+"}
                          </Button>
                        </div>
                        
                        {expandedLog === index && (
                          <div className="mt-2 space-y-2 border-t pt-2">
                            <div>
                              <div className="font-medium text-xs mb-1">Request Body:</div>
                              <pre className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto">
                                {JSON.stringify(log.requestBody, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="font-medium text-xs mb-1">Response Snippet:</div>
                              <pre className="bg-gray-100 p-2 rounded text-xs font-mono">
                                {log.responseSnippet}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
