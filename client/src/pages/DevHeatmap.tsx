
import React, { useState, useRef, useEffect } from 'react';
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { User } from "@shared/schema";
import { requestJson } from "@/utils/http";

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'ai' | 'data' | 'diagnostics';
  input: any;
  response?: any;
  error?: string;
}

export default function DevHeatmap({ user }: { user: User | null }) {
  // Panel states
  const [aiOpen, setAiOpen] = useState(true);
  const [dataOpen, setDataOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  // Form states
  const [aiUrl, setAiUrl] = useState(() => localStorage.getItem('devui-ai-url') || 'https://www.acquisition.com/');
  const [aiDevice, setAiDevice] = useState(() => localStorage.getItem('devui-ai-device') || 'desktop');
  const [dataUrl, setDataUrl] = useState(() => localStorage.getItem('devui-data-url') || 'https://www.acquisition.com/');
  const [dataDevice, setDataDevice] = useState(() => localStorage.getItem('devui-data-device') || 'desktop');
  const [dataPoints, setDataPoints] = useState(() => localStorage.getItem('devui-data-points') || '[\n  {"x": 100, "y": 200, "type": "click"},\n  {"x": 300, "y": 400, "type": "move"}\n]');

  // Response states
  const [aiLoading, setAiLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [dataResult, setDataResult] = useState<any>(null);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [aiError, setAiError] = useState<string>('');
  const [dataError, setDataError] = useState<string>('');
  const [diagError, setDiagError] = useState<string>('');
  const [dataPointsError, setDataPointsError] = useState<string>('');

  // Request log
  const [requestLog, setRequestLog] = useState<LogEntry[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist form values
  useEffect(() => {
    localStorage.setItem('devui-ai-url', aiUrl);
    localStorage.setItem('devui-ai-device', aiDevice);
    localStorage.setItem('devui-data-url', dataUrl);
    localStorage.setItem('devui-data-device', dataDevice);
    localStorage.setItem('devui-data-points', dataPoints);
  }, [aiUrl, aiDevice, dataUrl, dataDevice, dataPoints]);

  const addToLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newEntry: LogEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
    };
    setRequestLog(prev => [newEntry, ...prev.slice(0, 4)]);
  };

  const cancelPreviousRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
  };

  const handleAiSubmit = async () => {
    if (!aiUrl.trim()) return;
    
    cancelPreviousRequest();
    setAiLoading(true);
    setAiError('');
    setAiResult(null);

    const input = { url: aiUrl, device: aiDevice };
    
    try {
      const result = await requestJson('/api/v1/heatmap', input);
      setAiResult(result);
      addToLog({ type: 'ai', input, response: result });
    } catch (error: any) {
      const errorMsg = error.message || 'Request failed';
      setAiError(errorMsg);
      addToLog({ type: 'ai', input, error: errorMsg });
    } finally {
      setAiLoading(false);
    }
  };

  const handleDataSubmit = async () => {
    if (!dataUrl.trim()) return;
    
    // Validate JSON
    let parsedPoints;
    try {
      parsedPoints = JSON.parse(dataPoints);
      if (!Array.isArray(parsedPoints)) {
        throw new Error('dataPoints must be an array');
      }
      setDataPointsError('');
    } catch (error: any) {
      setDataPointsError(error.message);
      return;
    }

    cancelPreviousRequest();
    setDataLoading(true);
    setDataError('');
    setDataResult(null);

    const input = { url: dataUrl, device: dataDevice, dataPoints: parsedPoints };
    
    try {
      const result = await requestJson('/api/v1/heatmap/data', input);
      setDataResult(result);
      addToLog({ type: 'data', input, response: result });
    } catch (error: any) {
      const errorMsg = error.message || 'Request failed';
      setDataError(errorMsg);
      addToLog({ type: 'data', input, error: errorMsg });
    } finally {
      setDataLoading(false);
    }
  };

  const handleDiagnosticsSubmit = async () => {
    cancelPreviousRequest();
    setDiagLoading(true);
    setDiagError('');
    setDiagResult(null);

    try {
      const response = await fetch('/api/v1/heatmap/diagnostics');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const result = await response.json();
      setDiagResult(result);
      addToLog({ type: 'diagnostics', input: {}, response: result });
    } catch (error: any) {
      const errorMsg = error.message || 'Request failed';
      setDiagError(errorMsg);
      addToLog({ type: 'diagnostics', input: {}, error: errorMsg });
    } finally {
      setDiagLoading(false);
    }
  };

  const renderResult = (result: any, error: string) => {
    if (error) {
      return (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">Error</span>
          </div>
          <pre className="mt-2 text-sm text-red-700 whitespace-pre-wrap">{error}</pre>
        </div>
      );
    }

    if (!result) return null;

    return (
      <div className="mt-4 space-y-4">
        {result.base64 && (
          <div>
            <Label className="text-sm font-medium">Generated Image</Label>
            <div className="mt-2 border rounded-md overflow-hidden">
              <img 
                src={result.base64} 
                alt="Heatmap" 
                className="max-w-full h-auto"
                style={{ maxHeight: '400px' }}
              />
            </div>
          </div>
        )}
        
        <div>
          <Label className="text-sm font-medium">Response Metadata</Label>
          <pre className="mt-2 p-3 bg-gray-50 border rounded-md text-xs overflow-auto max-h-48">
            {JSON.stringify(result.meta || result, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <Layout user={user}>
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Heatmap Development UI</h1>
          <p className="text-muted-foreground mt-2">
            Test and debug heatmap generation endpoints with live preview
          </p>
          
          {/* QA Markers */}
          <div className="hidden">
            <span>AI Heatmap — /api/v1/heatmap</span>
            <span>Data Heatmap — /api/v1/heatmap/data</span>
            <span>Diagnostics — /api/v1/heatmap/diagnostics</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Panel A - AI Heatmap */}
            <Card>
              <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        AI Heatmap
                        <Badge variant="secondary">POST /api/v1/heatmap</Badge>
                      </CardTitle>
                      {aiOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="ai-url">URL</Label>
                        <Input
                          id="ai-url"
                          value={aiUrl}
                          onChange={(e) => setAiUrl(e.target.value)}
                          placeholder="https://example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="ai-device">Device</Label>
                        <Select value={aiDevice} onValueChange={setAiDevice}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="desktop">Desktop</SelectItem>
                            <SelectItem value="mobile">Mobile</SelectItem>
                            <SelectItem value="tablet">Tablet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={handleAiSubmit} 
                      disabled={aiLoading || !aiUrl.trim()}
                      className="w-full"
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Generate AI Heatmap'
                      )}
                    </Button>

                    {renderResult(aiResult, aiError)}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Panel B - Data Heatmap */}
            <Card>
              <Collapsible open={dataOpen} onOpenChange={setDataOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        Data Heatmap
                        <Badge variant="secondary">POST /api/v1/heatmap/data</Badge>
                      </CardTitle>
                      {dataOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="data-url">URL</Label>
                        <Input
                          id="data-url"
                          value={dataUrl}
                          onChange={(e) => setDataUrl(e.target.value)}
                          placeholder="https://example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="data-device">Device</Label>
                        <Select value={dataDevice} onValueChange={setDataDevice}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="desktop">Desktop</SelectItem>
                            <SelectItem value="mobile">Mobile</SelectItem>
                            <SelectItem value="tablet">Tablet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="data-points">Data Points (JSON)</Label>
                      <Textarea
                        id="data-points"
                        value={dataPoints}
                        onChange={(e) => setDataPoints(e.target.value)}
                        placeholder='[{"x": 100, "y": 200, "type": "click"}]'
                        rows={6}
                        className={dataPointsError ? 'border-red-500' : ''}
                      />
                      {dataPointsError && (
                        <p className="text-sm text-red-600 mt-1">{dataPointsError}</p>
                      )}
                    </div>
                    
                    <Button 
                      onClick={handleDataSubmit} 
                      disabled={dataLoading || !dataUrl.trim()}
                      className="w-full"
                    >
                      {dataLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Generate Data Heatmap'
                      )}
                    </Button>

                    {renderResult(dataResult, dataError)}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Panel C - Diagnostics */}
            <Card>
              <Collapsible open={diagOpen} onOpenChange={setDiagOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        Diagnostics
                        <Badge variant="secondary">GET /api/v1/heatmap/diagnostics</Badge>
                      </CardTitle>
                      {diagOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <Button 
                      onClick={handleDiagnosticsSubmit} 
                      disabled={diagLoading}
                      className="w-full"
                    >
                      {diagLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        'Fetch Diagnostics'
                      )}
                    </Button>

                    {diagError && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                        <div className="flex items-center gap-2 text-red-800">
                          <AlertCircle className="w-4 h-4" />
                          <span className="font-medium">Error</span>
                        </div>
                        <pre className="mt-2 text-sm text-red-700 whitespace-pre-wrap">{diagError}</pre>
                      </div>
                    )}

                    {diagResult && (
                      <div>
                        <Label className="text-sm font-medium">Diagnostics Result</Label>
                        <pre className="mt-2 p-3 bg-gray-50 border rounded-md text-xs overflow-auto max-h-96">
                          {JSON.stringify(diagResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </div>

          {/* Request Log */}
          <div className="space-y-4">
            <Card>
              <Collapsible open={logOpen} onOpenChange={setLogOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <CardTitle>Request Log</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{requestLog.length}/5</Badge>
                        {logOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    {requestLog.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No requests yet</p>
                    ) : (
                      <div className="space-y-3">
                        {requestLog.map((entry, idx) => (
                          <div key={entry.id} className="border rounded-md p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={entry.type === 'ai' ? 'default' : entry.type === 'data' ? 'secondary' : 'outline'}>
                                  {entry.type}
                                </Badge>
                                {entry.error ? (
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                ) : (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 p-1 text-xs">
                                  {entry.error ? 'View Error' : 'View Details'}
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-2 space-y-2">
                                  <div>
                                    <Label className="text-xs">Input:</Label>
                                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-24">
                                      {JSON.stringify(entry.input, null, 2)}
                                    </pre>
                                  </div>
                                  {entry.error ? (
                                    <div>
                                      <Label className="text-xs text-red-600">Error:</Label>
                                      <pre className="text-xs bg-red-50 p-2 rounded overflow-auto max-h-24 text-red-700">
                                        {entry.error}
                                      </pre>
                                    </div>
                                  ) : entry.response && (
                                    <div>
                                      <Label className="text-xs">Response:</Label>
                                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-24">
                                        {JSON.stringify(entry.response.meta || entry.response, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
