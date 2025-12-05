import { z } from 'zod';
import { Severity } from '../evaluators/types';

// Target specification schema for regex matching
export const TARGET_SPEC_SCHEMA = z.object({
  regex: z.string().optional(),
  flags: z.string().optional(),
  group: z.number().int().min(0).optional(),
  required: z.boolean().optional(),
  suggestion: z.string().optional(),
}).strict();

// Prompt criterion specification schema
export const PROMPT_CRITERION_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number().positive().optional(),
  target: TARGET_SPEC_SCHEMA.optional(),
});

// Prompt metadata schema for YAML frontmatter
/*
 * Evaluator type selection:
 * - 'base': unified evaluator (auto-detects scored vs basic mode from criteria)
 * - 'technical-accuracy': specialized evaluator with claim extraction + search
 *
 * Evaluation type:
 * - 'subjective': 1-4 scores per criterion, normalized to 1-10
 * - 'semi-objective': density-based scoring (errors per 100 words)
 *
 * Strictness factor for semi-objective scoring:
 * - Determines penalty weight per 1% error density.
 * - Default: 10
 */
export const PROMPT_META_SCHEMA = z.object({
  specVersion: z.union([z.string(), z.number()]).optional(),
  evaluator: z.enum(['base', 'technical-accuracy']).optional(),
  type: z.enum(['subjective', 'semi-objective']).optional(),
  id: z.string(),
  name: z.string(),
  severity: z.nativeEnum(Severity).optional(),
  strictness: z.union([
    z.number().positive(),
    z.enum(['lenient', 'standard', 'strict'])
  ]).optional(),
  target: TARGET_SPEC_SCHEMA.optional(),
  criteria: z.array(PROMPT_CRITERION_SCHEMA).optional(),
});

// Complete prompt file schema
export const PROMPT_FILE_SCHEMA = z.object({
  id: z.string(),
  filename: z.string(),
  fullPath: z.string(),
  meta: PROMPT_META_SCHEMA,
  body: z.string(),
  pack: z.string().optional(),
});

// Inferred types
export type TargetSpec = z.infer<typeof TARGET_SPEC_SCHEMA>;
export type PromptCriterionSpec = z.infer<typeof PROMPT_CRITERION_SCHEMA>;
export type PromptMeta = z.infer<typeof PROMPT_META_SCHEMA>;
export type PromptFile = z.infer<typeof PROMPT_FILE_SCHEMA>;
