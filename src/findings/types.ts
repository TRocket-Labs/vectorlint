import { z } from 'zod';
import { Severity } from '../evaluators/types';

/**
 * Input contract for shared finding processing (Phase 3, audit Finding #6).
 *
 * This module is the boundary between "what a model returned" (raw candidate
 * violations) and "what the formatters receive" (`ReviewResult`). It is
 * intentionally independent of model call (`single` | `agent`): there is no
 * `modelCall`, `mode`, `agent`, `evaluator`, `judge`, or rubric field here.
 *
 * Following the `src/review/` pattern, the domain types below are explicit
 * interfaces (so their optional properties stay assignable under
 * `exactOptionalPropertyTypes` to `CheckItem`/`GateViolationLike`), and the
 * Zod schemas mirror them for boundary validation. The schemas are strict so
 * legacy `evaluator`/`judge`/`modelCall`/`mode`/`agent`/rubric payloads are
 * rejected.
 */

/**
 * The two severity levels objective violation checks can resolve to. Mirrors
 * `ReviewSeverity`; values are identical (`'error'` | `'warning'`).
 */
export type RuleSeverity = typeof Severity.ERROR | typeof Severity.WARNING;

/** Optional strictness knob for check density scoring. */
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

/**
 * Criterion metadata used ONLY to name output rule ids
 * (`Pack.Rule.Criterion`). Weight and target are judge/rubric concerns and are
 * deliberately absent so the finding-processing contract cannot leak them.
 */
export interface FindingsCriterion {
  id: string;
  name: string;
}

/**
 * The narrow slice of prompt metadata that finding processing needs: severity
 * for scoring, strictness for density, and criteria for rule-id naming. It
 * excludes `evaluator`, `type`, `evaluateAs`, `target`, and other legacy
 * fields that do not affect objective violation-check processing.
 */
export interface PromptMetaForFindings {
  severity?: RuleSeverity;
  strictness?: Strictness;
  criteria?: FindingsCriterion[];
}

/**
 * The full finding-processing input. There is deliberately no `outputFormat`:
 * the processor emits a format-agnostic `ReviewResult`; the caller routes it
 * to a formatter.
 */
export interface FindingProcessingInput {
  pack: string;
  ruleId: string;
  ruleSource: string;
  candidateFindings: RawViolation[];
  wordCount: number;
  promptMeta: PromptMetaForFindings;
  targetContent: string;
}

// --- Boundary validation schemas (mirror the interfaces above) ---------------

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
