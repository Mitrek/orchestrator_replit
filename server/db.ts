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

// Create the HTTP client and Drizzle instance with retry logic
const sql = neon(process.env.DATABASE_URL, {
  onnotice: (notice) => console.log("Database notice:", notice),
  onerror: (error) => console.error("Database error:", error),
});

export const db = drizzle({ client: sql, schema });

// Helper function to execute database operations with retry logic
export async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxRetries = 3;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a connection-related error
      if (error.message?.includes('terminating connection') || 
          error.message?.includes('connection') ||
          error.code === '57P01') {
        
        console.log(`Database connection error on attempt ${attempt}/${maxRetries}, retrying...`);
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
      }
      
      // If it's not a connection error or we've exhausted retries, throw
      throw error;
    }
  }
  
  throw lastError!;
}
