import { z } from 'zod';

// Configuration file schema for .vectorlint.ini validation
export const CONFIG_SCHEMA = z.object({
  rulesPath: z.string().min(1).optional(),
  concurrency: z.number().int().positive().default(4),
  configDir: z.string().min(1),
  defaultSeverity: z.enum(['warning', 'error']).optional(),
  batchRules: z.boolean().default(false),
  maxRulesPerBatch: z.number().int().min(1).max(20).default(5),
  scanPaths: z.array(z.object({
    pattern: z.string(),
    runRules: z.array(z.string()).default([]),
    overrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  })).min(1),
});

// Inferred types
export type Config = z.infer<typeof CONFIG_SCHEMA>;
