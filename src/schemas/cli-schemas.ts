import { z } from 'zod';

// CLI options schema for command line argument validation
export const CLI_OPTIONS_SCHEMA = z.object({
  verbose: z.boolean().default(false),
  showPrompt: z.boolean().default(false),
  showPromptTrunc: z.boolean().default(false),
  debugJson: z.boolean().default(false),
  output: z.enum(['line', 'json', 'vale-json', 'JSON']).default('line'),
  evals: z.string().optional(),
  config: z.string().optional(),
});

// Validate command options schema
export const VALIDATE_OPTIONS_SCHEMA = z.object({
  evals: z.string().optional(),
});

// Convert command options schema
export const CONVERT_OPTIONS_SCHEMA = z.object({
  output: z.string().optional(),
  format: z.string().default('auto'),
  template: z.string().optional(),
  strictness: z.enum(['lenient', 'standard', 'strict']).default('standard'),
  severity: z.enum(['error', 'warning']).default('warning'),
  groupByCategory: z.boolean().default(true),
  maxCategories: z.string().optional().default('10'),
  rule: z.string().optional(),
  force: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  verbose: z.boolean().default(false),
});

// Inferred types
export type CliOptions = z.infer<typeof CLI_OPTIONS_SCHEMA>;
export type ValidateOptions = z.infer<typeof VALIDATE_OPTIONS_SCHEMA>;
export type ConvertOptions = z.infer<typeof CONVERT_OPTIONS_SCHEMA>;
