
import React, { useState, useRef } from "react";
import { requestJson } from "../utils/http";

interface RequestLogEntry {
  id: string;
  timestamp: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  request: any;
  response: any;
}

const DEFAULT_DATA_POINTS = JSON.stringify([
  { "x": 0.32, "y": 0.18, "type": "click" },
  { "x": 0.50, "y": 0.42, "type": "move" },
  { "x": 0.68, "y": 0.27, "type": "move" },
  { "x": 0.51, "y": 0.66, "type": "click" },
  { "x": 0.40, "y": 0.82, "type": "move" }
], null, 2);

export default function DevHeatmap() {
  // AI Heatmap state
  const [aiUrl, setAiUrl] = useState(() => 
    localStorage.getItem("heatmap_dev_ai_form") 
      ? JSON.parse(localStorage.getItem("heatmap_dev_ai_form")!).url 
      : "https://www.acquisition.com/"
  );
  const [aiDevice, setAiDevice] = useState(() => 
    localStorage.getItem("heatmap_dev_ai_form") 
      ? JSON.parse(localStorage.getItem("heatmap_dev_ai_form")!).device 
      : "desktop"
  );
  const [aiPersist, setAiPersist] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Data Heatmap state
  const [dataUrl, setDataUrl] = useState(() => 
    localStorage.getItem("heatmap_dev_data_form") 
      ? JSON.parse(localStorage.getItem("heatmap_dev_data_form")!).url 
      : "https://www.acquisition.com/"
  );
  const [dataDevice, setDataDevice] = useState(() => 
    localStorage.getItem("heatmap_dev_data_form") 
      ? JSON.parse(localStorage.getItem("heatmap_dev_data_form")!).device 
      : "desktop"
  );
  const [dataPoints, setDataPoints] = useState(() => 
    localStorage.getItem("heatmap_dev_data_form") 
      ? JSON.parse(localStorage.getItem("heatmap_dev_data_form")!).dataPoints 
      : DEFAULT_DATA_POINTS
  );
  const [dataPersist, setDataPersist] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  // Console state
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [currentStatus, setCurrentStatus] = useState<number | null>(null);
  const [currentDuration, setCurrentDuration] = useState<number | null>(null);
  const [currentReqId, setCurrentReqId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([]);
  const [errors, setErrors] = useState<{ ai?: string; data?: string }>({});

  const aiAbortRef = useRef<AbortController | null>(null);
  const dataAbortRef = useRef<AbortController | null>(null);

  const addToLog = (entry: Omit<RequestLogEntry, "id" | "timestamp">) => {
    const logEntry: RequestLogEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
    };
    setRequestLog(prev => [logEntry, ...prev].slice(0, 5));
  };

  const validateUrl = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const validateDataPoints = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) && parsed.every(p => 
        typeof p === "object" && 
        typeof p.x === "number" && p.x >= 0 && p.x <= 1 &&
        typeof p.y === "number" && p.y >= 0 && p.y <= 1
      );
    } catch {
      return false;
    }
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors(prev => ({ ...prev, ai: undefined }));

    if (!validateUrl(aiUrl)) {
      setErrors(prev => ({ ...prev, ai: "URL must start with http:// or https://" }));
      return;
    }

    // Abort previous request
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }
    aiAbortRef.current = new AbortController();

    setAiLoading(true);
    
    try {
      const requestBody = { url: aiUrl, device: aiDevice };
      const result = await requestJson({
        url: "/api/v1/heatmap",
        method: "POST",
        body: requestBody,
        signal: aiAbortRef.current.signal,
      });

      setCurrentImage(result.data.base64);
      setCurrentMeta(result.data.meta);
      setCurrentStatus(result.status);
      setCurrentDuration(result.durationMs);
      setCurrentReqId(result.data.meta?.reqId || null);
      
      const truncatedResponse = {
        ...result.data,
        base64: result.data.base64 ? `${result.data.base64.slice(0, 64)}... (${result.data.base64.length} chars)` : null
      };
      setRawResponse(truncatedResponse);

      addToLog({
        route: "/api/v1/heatmap",
        method: "POST",
        status: result.status,
        durationMs: result.durationMs,
        request: requestBody,
        response: truncatedResponse,
      });

      if (aiPersist) {
        localStorage.setItem("heatmap_dev_ai_form", JSON.stringify({ url: aiUrl, device: aiDevice }));
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        setErrors(prev => ({ ...prev, ai: error.message }));
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleDataSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors(prev => ({ ...prev, data: undefined }));

    if (!validateUrl(dataUrl)) {
      setErrors(prev => ({ ...prev, data: "URL must start with http:// or https://" }));
      return;
    }

    if (!validateDataPoints(dataPoints)) {
      setErrors(prev => ({ ...prev, data: "Data points must be valid JSON array with normalized coordinates" }));
      return;
    }

    // Abort previous request
    if (dataAbortRef.current) {
      dataAbortRef.current.abort();
    }
    dataAbortRef.current = new AbortController();

    setDataLoading(true);
    
    try {
      const requestBody = { url: dataUrl, device: dataDevice, dataPoints: JSON.parse(dataPoints) };
      const result = await requestJson({
        url: "/api/v1/heatmap/data",
        method: "POST",
        body: requestBody,
        signal: dataAbortRef.current.signal,
      });

      setCurrentImage(result.data.base64 || result.data.image);
      setCurrentMeta(result.data.meta);
      setCurrentStatus(result.status);
      setCurrentDuration(result.durationMs);
      setCurrentReqId(result.data.meta?.reqId || null);
      
      const truncatedResponse = {
        ...result.data,
        base64: result.data.base64 ? `${result.data.base64.slice(0, 64)}... (${result.data.base64.length} chars)` : null,
        image: result.data.image ? `${result.data.image.slice(0, 64)}... (${result.data.image.length} chars)` : null
      };
      setRawResponse(truncatedResponse);

      addToLog({
        route: "/api/v1/heatmap/data",
        method: "POST",
        status: result.status,
        durationMs: result.durationMs,
        request: requestBody,
        response: truncatedResponse,
      });

      if (dataPersist) {
        localStorage.setItem("heatmap_dev_data_form", JSON.stringify({ url: dataUrl, device: dataDevice, dataPoints }));
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        setErrors(prev => ({ ...prev, data: error.message }));
      }
    } finally {
      setDataLoading(false);
    }
  };

  const handleDiagnostics = async (endpoint: string) => {
    try {
      const result = await requestJson({
        url: endpoint,
        method: "GET",
      });

      setRawResponse(result.data);
      addToLog({
        route: endpoint,
        method: "GET",
        status: result.status,
        durationMs: result.durationMs,
        request: null,
        response: result.data,
      });
    } catch (error: any) {
      setErrors(prev => ({ ...prev, diagnostics: error.message }));
    }
  };

  const copyBase64 = () => {
    if (currentImage) {
      navigator.clipboard.writeText(currentImage);
    }
  };

  const downloadPng = () => {
    if (!currentImage) return;
    
    const base64Data = currentImage.replace(/^data:image\/png;base64,/, '');
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heatmap-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1200px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column - Controls */}
      <div className="space-y-6">
        {/* AI Heatmap Panel */}
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold mb-4">AI Heatmap — /api/v1/heatmap</h2>
          <form onSubmit={handleAiSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">URL</label>
              <input
                type="text"
                value={aiUrl}
                onChange={(e) => setAiUrl(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Device</label>
              <select
                value={aiDevice}
                onChange={(e) => setAiDevice(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="ai-persist"
                checked={aiPersist}
                onChange={(e) => setAiPersist(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="ai-persist" className="text-sm">Persist form data</label>
            </div>
            {errors.ai && <div className="text-red-600 text-sm">{errors.ai}</div>}
            <button
              type="submit"
              disabled={aiLoading}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {aiLoading ? "Generating..." : "Generate AI Heatmap"}
            </button>
          </form>
        </div>

        {/* Data Heatmap Panel */}
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold mb-4">Data Heatmap — /api/v1/heatmap/data</h2>
          <form onSubmit={handleDataSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">URL</label>
              <input
                type="text"
                value={dataUrl}
                onChange={(e) => setDataUrl(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Device</label>
              <select
                value={dataDevice}
                onChange={(e) => setDataDevice(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Data Points (JSON)</label>
              <textarea
                value={dataPoints}
                onChange={(e) => setDataPoints(e.target.value)}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                rows={8}
                placeholder="JSON array of data points"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="data-persist"
                checked={dataPersist}
                onChange={(e) => setDataPersist(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="data-persist" className="text-sm">Persist form data</label>
            </div>
            {errors.data && <div className="text-red-600 text-sm">{errors.data}</div>}
            <button
              type="submit"
              disabled={dataLoading}
              className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {dataLoading ? "Generating..." : "Generate Data Heatmap"}
            </button>
          </form>
        </div>

        {/* Diagnostics Panel */}
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold mb-4">Diagnostics</h2>
          <div className="space-y-2">
            <button
              onClick={() => handleDiagnostics("/health")}
              className="w-full bg-gray-600 text-white py-2 rounded-md hover:bg-gray-700"
            >
              GET /health
            </button>
            <button
              onClick={() => handleDiagnostics("/api/v1/heatmap/diagnostics")}
              className="w-full bg-gray-600 text-white py-2 rounded-md hover:bg-gray-700"
            >
              GET /api/v1/heatmap/diagnostics
            </button>
          </div>
        </div>
      </div>

      {/* Right Column - Console */}
      <div className="space-y-6">
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold mb-4">Console</h2>
          
          {/* Image Preview */}
          {currentImage && (
            <div className="mb-4">
              <h3 className="font-medium mb-2">Image Preview</h3>
              <div className="border rounded-md p-2 max-h-64 overflow-auto">
                <img src={currentImage} alt="Heatmap" className="max-w-full h-auto" />
              </div>
            </div>
          )}

          {/* Meta Summary */}
          {currentMeta && (
            <div className="mb-4">
              <h3 className="font-medium mb-2">Meta Summary</h3>
              <div className="text-sm space-y-1">
                {currentReqId && <div><strong>Request ID:</strong> {currentReqId}</div>}
                <div><strong>Phase:</strong> {currentMeta.phase}</div>
                <div><strong>Engine:</strong> {currentMeta.engine}</div>
                {currentMeta.viewport && (
                  <div><strong>Viewport:</strong> {currentMeta.viewport.width}x{currentMeta.viewport.height}</div>
                )}
                {currentStatus && <div><strong>Status:</strong> {currentStatus}</div>}
                {currentDuration && <div><strong>Duration:</strong> {currentDuration}ms</div>}
              </div>
            </div>
          )}

          {/* Actions */}
          {currentImage && (
            <div className="mb-4">
              <h3 className="font-medium mb-2">Actions</h3>
              <div className="space-x-2">
                <button
                  onClick={copyBase64}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  Copy Base64
                </button>
                <button
                  onClick={downloadPng}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                >
                  Download PNG
                </button>
              </div>
            </div>
          )}

          {/* Raw JSON */}
          {rawResponse && (
            <div className="mb-4">
              <h3 className="font-medium mb-2">Raw JSON</h3>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          )}

          {/* Request Log */}
          <div>
            <h3 className="font-medium mb-2">Request Log (Last 5)</h3>
            <div className="space-y-2">
              {requestLog.map((entry) => (
                <details key={entry.id} className="border rounded p-2">
                  <summary className="cursor-pointer text-sm">
                    {new Date(entry.timestamp).toLocaleTimeString()} - {entry.method} {entry.route} - {entry.status} ({entry.durationMs}ms)
                  </summary>
                  <div className="mt-2 text-xs">
                    <div><strong>Request:</strong></div>
                    <pre className="bg-gray-100 p-1 rounded mb-2 overflow-auto">
                      {JSON.stringify(entry.request, null, 2)}
                    </pre>
                    <div><strong>Response:</strong></div>
                    <pre className="bg-gray-100 p-1 rounded overflow-auto">
                      {JSON.stringify(entry.response, null, 2)}
                    </pre>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
