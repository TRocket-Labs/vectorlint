import { z } from 'zod';
import { Severity } from '../evaluators/types';

/** Severity assigned to a rule and its findings. */
export type RuleSeverity = typeof Severity.ERROR | typeof Severity.WARNING;

/** Optional strictness knob for density scoring. */
export type Strictness = number | 'lenient' | 'standard' | 'strict';

/**
 * The six boolean evidence gates a model returns per violation. Structurally
 * identical to `GateChecks` in `src/prompts/schema.ts`.
 */
export interface GateChecks {
  rule_supports_claim: boolean;
  evidence_exact: boolean;
  context_supports_violation: boolean;
  plausible_non_violation: boolean;
  fix_is_drop_in: boolean;
  fix_preserves_meaning: boolean;
}

/**
 * A raw candidate finding returned by a reviewer model, before evidence
 * verification or filtering. `analysis` is the only required descriptive
 * field; everything else is optional to tolerate partial model output while
 * still failing closed at the filter and verifier stages.
 */
export interface RawViolation {
  line?: number;
  quoted_text?: string;
  context_before?: string;
  context_after?: string;
  description?: string;
  /** Optional criterion attribution used to build `Pack.Rule.Criterion` ids. */
  criterionName?: string;
  analysis: string;
  message?: string;
  suggestion?: string;
  fix?: string;
  rule_quote?: string;
  confidence?: number;
  checks?: GateChecks;
}

/** Criterion metadata used to name `Pack.Rule.Criterion` output ids. */
export interface FindingsCriterion {
  id: string;
  name: string;
}

/** Prompt metadata used by finding processing. */
export interface PromptMetaForFindings {
  severity?: RuleSeverity;
  strictness?: Strictness;
  criteria?: FindingsCriterion[];
}

/** Format-independent input for finding processing. */
export interface FindingProcessingInput {
  pack: string;
  ruleId: string;
  ruleSource: string;
  candidateFindings: RawViolation[];
  wordCount: number;
  promptMeta: PromptMetaForFindings;
  targetContent: string;
}

export const GATE_CHECKS_SCHEMA = z
  .object({
    rule_supports_claim: z.boolean(),
    evidence_exact: z.boolean(),
    context_supports_violation: z.boolean(),
    plausible_non_violation: z.boolean(),
    fix_is_drop_in: z.boolean(),
    fix_preserves_meaning: z.boolean(),
  })
  .strict();

export const RAW_VIOLATION_SCHEMA = z
  .object({
    line: z.number().optional(),
    quoted_text: z.string().optional(),
    context_before: z.string().optional(),
    context_after: z.string().optional(),
    description: z.string().optional(),
    criterionName: z.string().optional(),
    analysis: z.string(),
    message: z.string().optional(),
    suggestion: z.string().optional(),
    fix: z.string().optional(),
    rule_quote: z.string().optional(),
    confidence: z.number().optional(),
    checks: GATE_CHECKS_SCHEMA.optional(),
  })
  .strict();

export const FINDINGS_CRITERION_SCHEMA = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export const PROMPT_META_FOR_FINDINGS_SCHEMA = z
  .object({
    severity: z.nativeEnum(Severity).optional(),
    strictness: z
      .union([z.number().positive(), z.enum(['lenient', 'standard', 'strict'])])
      .optional(),
    criteria: z.array(FINDINGS_CRITERION_SCHEMA).optional(),
  })
  .strict();

export const FINDING_PROCESSING_INPUT_SCHEMA = z
  .object({
    pack: z.string().min(1),
    ruleId: z.string().min(1),
    ruleSource: z.string().min(1),
    candidateFindings: z.array(RAW_VIOLATION_SCHEMA),
    wordCount: z.number().nonnegative(),
    promptMeta: PROMPT_META_FOR_FINDINGS_SCHEMA,
    targetContent: z.string(),
  })
  .strict();
