
export interface RequestOptions {
  url: string;
  method?: "GET" | "POST";
  body?: any;
  signal?: AbortSignal;
}

export interface RequestResponse<T = any> {
  status: number;
  durationMs: number;
  data: T;
}

export async function requestJson<T = any>({
  url,
  method = "GET",
  body,
  signal,
}: RequestOptions): Promise<RequestResponse<T>> {
  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : {},
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
      signal,
    });

    const durationMs = Math.round(performance.now() - startTime);
    const data = await response.json();

    return {
      status: response.status,
      durationMs,
      data,
    };
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);
    
    if (error.name === "AbortError") {
      throw {
        status: 0,
        durationMs,
        error: "ABORTED",
      };
    }

    throw {
      status: 0,
      durationMs,
      error: "NETWORK_ERROR",
    };
  }
}
