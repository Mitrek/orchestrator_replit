
export interface RequestOptions {
  url: string;
  method?: "GET" | "POST";
  body?: any;
  signal?: AbortSignal;
}

export interface RequestResult<T> {
  status: number;
  durationMs: number;
  data: T;
}

export async function requestJson<T>(opts: RequestOptions): Promise<RequestResult<T>> {
  const startTime = Date.now();
  
  try {
    const requestInit: RequestInit = {
      method: opts.method || "GET",
      signal: opts.signal,
    };

    if (opts.body) {
      requestInit.headers = {
        "Content-Type": "application/json",
      };
      requestInit.body = JSON.stringify(opts.body);
    }

    const response = await fetch(opts.url, requestInit);
    const durationMs = Date.now() - startTime;
    
    let data: T;
    try {
      data = await response.json();
    } catch {
      data = {} as T;
    }

    return {
      status: response.status,
      durationMs,
      data,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    if (error.name === "AbortError") {
      throw { status: 0, durationMs, error: "ABORTED" };
    }
    
    throw { status: 0, durationMs, error: "NETWORK_ERROR" };
  }
}
