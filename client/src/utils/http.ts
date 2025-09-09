
export async function requestJson<T>(opts: {
  url: string; 
  method?: "GET"|"POST"; 
  body?: any; 
  signal?: AbortSignal;
}): Promise<{ status: number; durationMs: number; data: T | any }> {
  const started = performance.now();
  try {
    const resp = await fetch(opts.url, {
      method: opts.method ?? "GET",
      headers: opts.method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: opts.method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: opts.signal,
    });
    const durationMs = Math.round(performance.now() - started);
    const text = await resp.text();
    let data: any = null;
    try { 
      data = text ? JSON.parse(text) : null; 
    } catch { 
      data = text; 
    }
    return { status: resp.status, durationMs, data };
  } catch (e: any) {
    const durationMs = Math.round(performance.now() - started);
    throw { 
      status: 0, 
      durationMs, 
      error: e?.name === "AbortError" ? "ABORTED" : "NETWORK_ERROR" 
    };
  }
}
