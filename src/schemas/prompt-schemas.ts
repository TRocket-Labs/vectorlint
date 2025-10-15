import { z } from 'zod';

// Target specification schema
export const TARGET_SPEC_SCHEMA = z.object({
  regex: z.string().optional(),
  flags: z.string().optional(),
  group: z.number().optional(),
  required: z.boolean().optional(),
  suggestion: z.string().optional(),
});

// Criterion specification schema  
export const PROMPT_CRITERION_SPEC_SCHEMA = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  weight: z.number().positive(),
  target: TARGET_SPEC_SCHEMA.optional(),
});

// Main prompt metadata schema
export const PROMPT_META_SCHEMA = z.object({
  specVersion: z.union([z.string(), z.number()]).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  threshold: z.number().optional(),
  severity: z.enum(['warning', 'error']).optional(),
  target: TARGET_SPEC_SCHEMA.optional(),
  criteria: z.array(PROMPT_CRITERION_SPEC_SCHEMA),
});

// Full prompt file schema
export const PROMPT_FILE_SCHEMA = z.object({
  filename: z.string(),
  id: z.string(),
  fullPath: z.string(),
  meta: PROMPT_META_SCHEMA,
  body: z.string(),
});

// Export types
export type TargetSpec = z.infer<typeof TARGET_SPEC_SCHEMA>;
export type PromptCriterionSpec = z.infer<typeof PROMPT_CRITERION_SPEC_SCHEMA>;
export type PromptMeta = z.infer<typeof PROMPT_META_SCHEMA>;
export type PromptFile = z.infer<typeof PROMPT_FILE_SCHEMA>;