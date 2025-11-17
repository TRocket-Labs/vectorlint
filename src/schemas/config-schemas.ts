import { z } from 'zod';

// Configuration file schema for vectorlint.ini validation
export const CONFIG_SCHEMA = z.object({
  promptsPath: z.string().min(1),
  scanPaths: z.array(z.string().min(1)).min(1),
  concurrency: z.number().int().positive().default(4),
  evaluators: z.object({
    enabled: z.array(z.string()).optional(),
    valeAI: z.object({
      contextWindowSize: z.number().int().positive().default(100),
    }).optional(),
  }).optional(),
});

// Inferred types
export type Config = z.infer<typeof CONFIG_SCHEMA>;
