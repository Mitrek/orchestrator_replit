
import { nanoid } from "nanoid";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface BaseLogEntry {
  ts: string;
  level: LogLevel;
  phase: "phase8";
  reqId?: string;
}

export interface RequestLogEntry extends BaseLogEntry {
  route: string;
  method: string;
  status: number;
  url?: string;
  device?: string;
  engine?: string;
  durationMs: number;
  cached?: boolean;
  errCode?: string;
  errType?: string;
}

export interface ErrorLogEntry extends BaseLogEntry {
  route: string;
  errType: string;
  errCode: string;
  message: string;
}

// Error type taxonomy
export const ERROR_TYPES = {
  NAVIGATION_TIMEOUT: "NAVIGATION_TIMEOUT",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE", 
  AI_JSON_INVALID: "AI_JSON_INVALID",
  AI_TIMEOUT: "AI_TIMEOUT",
  BAD_INPUT: "BAD_INPUT",
  RENDER_FAILED: "RENDER_FAILED",
  UNKNOWN: "UNKNOWN"
} as const;

export type ErrorType = typeof ERROR_TYPES[keyof typeof ERROR_TYPES];

export function generateRequestId(): string {
  return nanoid(8);
}

export function redactUrl(url: string): string {
  if (url.length <= 200) return url;
  return url.substring(0, 197) + "...";
}

export function logRequest(entry: RequestLogEntry): void {
  const sanitized = {
    ...entry,
    url: entry.url ? redactUrl(entry.url) : undefined,
    ts: new Date().toISOString()
  };
  console.log(JSON.stringify(sanitized));
}

export function logError(entry: ErrorLogEntry): void {
  const sanitized = {
    ...entry,
    ts: new Date().toISOString()
  };
  console.log(JSON.stringify(sanitized));
}

export function logInfo(message: string, data?: Record<string, any>): void {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    phase: "phase8",
    message,
    ...data
  }));
}
