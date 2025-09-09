
export interface RequestConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  signal?: AbortSignal;
}

export interface RequestResult<T = any> {
  status: number;
  durationMs: number;
  data: T;
}

export async function requestJson<T = any>(config: RequestConfig): Promise<RequestResult<T>> {
  const startTime = performance.now();
  
  try {
    const response = await fetch(config.url, {
      method: config.method || "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: config.body ? JSON.stringify(config.body) : undefined,
      signal: config.signal,
    });

    const data = await response.json();
    const durationMs = Math.round(performance.now() - startTime);

    return {
      status: response.status,
      durationMs,
      data,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    
    throw new Error(`Request failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
