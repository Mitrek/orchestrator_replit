// server/db.ts
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@shared/schema";

// Cache HTTP connections between calls (helps in dev and serverless)
neonConfig.fetchConnectionCache = true;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create the HTTP client and Drizzle instance
const sql = neon(process.env.DATABASE_URL);
export const db = drizzle({ client: sql, schema });
