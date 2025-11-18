import { z } from 'zod';

// CLI options schema for command line argument validation
export const CLI_OPTIONS_SCHEMA = z.object({
  verbose: z.boolean().default(false),
  showPrompt: z.boolean().default(false),
  showPromptTrunc: z.boolean().default(false),
  debugJson: z.boolean().default(false),
  showUrls: z.boolean().default(false),
  prompts: z.string().optional(),
});

// Validate command options schema
export const VALIDATE_OPTIONS_SCHEMA = z.object({
  prompts: z.string().optional(),
});

// Inferred types
export type CliOptions = z.infer<typeof CLI_OPTIONS_SCHEMA>;
export type ValidateOptions = z.infer<typeof VALIDATE_OPTIONS_SCHEMA>;