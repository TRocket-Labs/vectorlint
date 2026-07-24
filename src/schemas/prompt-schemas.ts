import { z } from "zod";
import { Severity } from "../review/severity";

// Target specification schema for regex matching
export const TARGET_SPEC_SCHEMA = z
  .object({
    regex: z.string().optional(),
    flags: z.string().optional(),
    group: z.number().int().min(0).optional(),
    required: z.boolean().optional(),
    suggestion: z.string().optional(),
  })
  .strict();

// Prompt criterion specification schema
export const PROMPT_CRITERION_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
});

// Prompt metadata schema for YAML frontmatter.
export const PROMPT_META_SCHEMA = z.object({
  specVersion: z.union([z.string(), z.number()]).optional(),
  id: z.string(),
  name: z.string(),
  severity: z.nativeEnum(Severity).optional(),
  strictness: z
    .union([z.number().positive(), z.enum(["lenient", "standard", "strict"])])
    .optional(),
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
  pack: z.string(),
});

// Inferred types
export type TargetSpec = z.infer<typeof TARGET_SPEC_SCHEMA>;
export type PromptCriterionSpec = z.infer<typeof PROMPT_CRITERION_SCHEMA>;
export type PromptMeta = z.infer<typeof PROMPT_META_SCHEMA>;
export type PromptFile = z.infer<typeof PROMPT_FILE_SCHEMA>;
