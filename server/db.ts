// server/db.ts
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@shared/schema";

neonConfig.fetchConnectionCache = true;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

const sql = neon(url);
export const db = drizzle({ client: sql, schema });

// Optional: transient retry
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const code = err?.code || err?.cause?.code;
    if (retries > 0 && (code === "57P01" || code === "ECONNRESET" || code === "ETIMEDOUT")) {
      await new Promise(r => setTimeout(r, 500));
      return withDbRetry(fn, retries - 1);
    }
    throw err;
  }
}
