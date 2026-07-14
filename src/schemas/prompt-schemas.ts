import { z } from "zod";
import { Severity } from "../evaluators/types";

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
 * - 'check': density-based scoring (errors per 100 words)
 * - 'semi-objective': deprecated alias for 'check'
 *
 * 'judge' and its deprecated alias 'subjective' are no longer supported
 * (Phase 3): subjective rubric scoring is not a future-facing review type.
 * The enum still admits them so the Zod error is descriptive and the inferred
 * type stays compatible with the legacy BaseEvaluator until Phase 4 deletes
 * that path; a superRefine rejects them at this boundary so judge-typed prompts
 * fail to load.
 *
 * Strictness factor for check scoring:
 * - Determines penalty weight per 1% error density.
 * - Default: 10
 */
export const PROMPT_META_SCHEMA = z.object({
  specVersion: z.union([z.string(), z.number()]).optional(),
  evaluator: z.enum(["base", "technical-accuracy"]).optional(),
  type: z
    .enum(["judge", "check", "subjective", "semi-objective"])
    .transform((val) => {
      // Map deprecated values to their canonical forms.
      if (val === "subjective") return "judge" as const;
      if (val === "semi-objective") return "check" as const;
      return val;
    })
    .superRefine((val, ctx) => {
      // Judge/rubric reviews are not a future-facing review type (Phase 3).
      // superRefine (not refine) so the inferred union still includes 'judge'
      // and stays compatible with the legacy BaseEvaluator until Phase 4 deletes
      // that path; the value is rejected at this boundary regardless.
      if (val === "judge") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "judge evaluation is no longer supported; use check (Via Negativa) rules",
        });
      }
    })
    .optional(),
  id: z.string(),
  name: z.string(),
  severity: z.nativeEnum(Severity).optional(),
  strictness: z
    .union([z.number().positive(), z.enum(["lenient", "standard", "strict"])])
    .optional(),
  target: TARGET_SPEC_SCHEMA.optional(),
  criteria: z.array(PROMPT_CRITERION_SCHEMA).optional(),
  // Determines how content is evaluated: 'chunk' (default) for chunked processing, 'document' for full document
  evaluateAs: z.enum(["document", "chunk"]).optional(),
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
