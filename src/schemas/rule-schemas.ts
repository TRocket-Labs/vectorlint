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

// Rule criterion specification schema
export const RULE_CRITERION_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number().positive().optional(),
  target: TARGET_SPEC_SCHEMA.optional(),
});

// Rule metadata schema for YAML frontmatter
/*
 * Evaluator type selection:
 * - 'base': unified evaluator (auto-detects scored vs basic mode from criteria)
 * - 'technical-accuracy': specialized evaluator with claim extraction + search
 *
 * Evaluation type:
 * - 'judge': 1-4 scores per criterion, normalized to 1-10
 * - 'check': density-based scoring (errors per 100 words)
 *
 * Deprecated aliases (still supported):
 * - 'subjective' → 'judge'
 * - 'semi-objective' → 'check'
 *
 * Strictness factor for check scoring:
 * - Determines penalty weight per 1% error density.
 * - Default: 10
 */
export const RULE_META_SCHEMA = z.object({
  specVersion: z.union([z.string(), z.number()]).optional(),
  evaluator: z.enum(["base", "technical-accuracy"]).optional(),
  type: z
    .enum(["judge", "check", "subjective", "semi-objective"])
    .transform((val) => {
      // Map deprecated values to new canonical values
      if (val === "subjective") return "judge" as const;
      if (val === "semi-objective") return "check" as const;
      return val;
    })
    .optional(),
  id: z.string(),
  name: z.string(),
  severity: z.nativeEnum(Severity).optional(),
  strictness: z
    .union([z.number().positive(), z.enum(["lenient", "standard", "strict"])])
    .optional(),
  target: TARGET_SPEC_SCHEMA.optional(),
  criteria: z.array(RULE_CRITERION_SCHEMA).optional(),
  // Determines how content is evaluated: 'chunk' (default) for chunked processing, 'document' for full document
  evaluateAs: z.enum(["document", "chunk"]).optional(),
});


// Complete rule file schema
export const RULE_FILE_SCHEMA = z.object({
  id: z.string(),
  filename: z.string(),
  fullPath: z.string(),
  meta: RULE_META_SCHEMA,
  content: z.string(),
  pack: z.string(),
});

// Inferred types
export type TargetSpec = z.infer<typeof TARGET_SPEC_SCHEMA>;
export type RuleCriterionSpec = z.infer<typeof RULE_CRITERION_SCHEMA>;
export type RuleMeta = z.infer<typeof RULE_META_SCHEMA>;
export type RuleFile = z.infer<typeof RULE_FILE_SCHEMA>;
