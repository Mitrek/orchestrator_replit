
import { z } from 'zod';

export const ViewportSchema = z.object({
  width: z.number().min(320).max(3840),
  height: z.number().min(240).max(2160)
});

export const AIRequestSchema = z.object({
  url: z.string().url(),
  viewport: ViewportSchema.optional(),
  return: z.enum(['base64', 'url']).optional().default('base64')
});

export const DataRequestSchema = z.object({
  url: z.string().url(),
  return: z.enum(['base64', 'url']).optional().default('base64'),
  segments: z.object({
    desktop: ViewportSchema.optional(),
    tablet: ViewportSchema.optional(),
    mobile: ViewportSchema.optional()
  }).optional()
});

export type AIRequest = z.infer<typeof AIRequestSchema>;
export type DataRequest = z.infer<typeof DataRequestSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}
