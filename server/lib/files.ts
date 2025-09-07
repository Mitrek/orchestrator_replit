
import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import pino from "pino";

const logger = pino();

const OUTPUT_DIR = 'public/outputs';

export async function ensureOutputDir(): Promise<void> {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    logger.warn({ error }, 'Failed to create output directory');
  }
}

export async function saveImage(buffer: Buffer, prefix: string = 'heatmap'): Promise<string> {
  await ensureOutputDir();
  
  const filename = `${prefix}_${nanoid()}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);
  
  await fs.writeFile(filepath, buffer);
  
  // Return public URL path
  return `/outputs/${filename}`;
}

export function getOutputPath(filename: string): string {
  return path.join(OUTPUT_DIR, filename);
}

export async function cleanupOldFiles(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const now = Date.now();
    
    for (const file of files) {
      const filepath = path.join(OUTPUT_DIR, file);
      const stats = await fs.stat(filepath);
      
      if (now - stats.mtimeMs > maxAgeMs) {
        await fs.unlink(filepath);
        logger.info({ file }, 'Cleaned up old file');
      }
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to cleanup old files');
  }
}
