import { z } from 'zod';
import { DEFAULT_OUTPUT_FORMAT, DEFAULT_REVIEW_MODEL_CALL, OutputFormat, REVIEW_MODEL_CALLS } from '../cli/types';

// CLI options schema for command line argument validation
export const CLI_OPTIONS_SCHEMA = z.object({
  verbose: z.boolean().default(false),
  showPrompt: z.boolean().default(false),
  showPromptTrunc: z.boolean().default(false),
  debugJson: z.boolean().default(false),
  output: z.nativeEnum(OutputFormat).default(DEFAULT_OUTPUT_FORMAT),
  modelCall: z.enum(REVIEW_MODEL_CALLS).default(DEFAULT_REVIEW_MODEL_CALL),
  prompts: z.string().optional(),
  config: z.string().optional(),
});

// Validate command options schema
export const VALIDATE_OPTIONS_SCHEMA = z.object({
  rules: z.string().optional(),
});

export const PACKAGE_JSON_SCHEMA = z.object({
  version: z.string(),
});

// Inferred types
export type CliOptions = z.infer<typeof CLI_OPTIONS_SCHEMA>;
export type ValidateOptions = z.infer<typeof VALIDATE_OPTIONS_SCHEMA>;
