import { z } from 'zod';

// Configuration file schema for vectorlint.ini validation
export const CONFIG_SCHEMA = z.object({
  evalsPath: z.string().min(1),
  scanPaths: z.array(z.string().min(1)).min(1),
  concurrency: z.number().int().positive().default(4),
  configDir: z.string().min(1),
  defaultSeverity: z.enum(['warning', 'error']).optional(),
  fileSections: z.array(z.object({
    pattern: z.string(),
    runEvals: z.array(z.string()),
    overrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  })).default([]),
});

// Inferred types
export type Config = z.infer<typeof CONFIG_SCHEMA>;
