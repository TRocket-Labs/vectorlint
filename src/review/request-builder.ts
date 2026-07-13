import type { PromptFile } from '../schemas/prompt-schemas';
import type {
  ReviewBudget,
  ReviewContext,
  ReviewModelCall,
  ReviewOutputPolicy,
  ReviewRequest,
  ReviewRule,
  ReviewTarget,
} from './types';
import { DEFAULT_REVIEW_BUDGET } from './budget';
import { ValidationError } from '../errors';

/** Default output policy: include usage metadata, never record payloads. */
export const DEFAULT_REVIEW_OUTPUT_POLICY: Readonly<ReviewOutputPolicy> = Object.freeze({
  includeUsage: true,
  recordPayloadTelemetry: false,
});

/** Optional overrides applied by {@link buildReviewRequest}. */
export interface ReviewRequestBuilderConfig {
  budget?: ReviewBudget;
  outputPolicy?: ReviewOutputPolicy;
  modelCall?: ReviewModelCall;
}

export interface BuildReviewRequestParams {
  target: ReviewTarget;
  /** Existing prompt files to convert into source-backed ReviewRules. */
  prompts: readonly PromptFile[];
  /** Caller-supplied, in-scope context, passed through unchanged. */
  context?: ReviewContext[];
  config?: ReviewRequestBuilderConfig;
}

/** Builds the stable ReviewRule id formatted Pack.Rule (mirrors src/agent/rule-id.ts). */
function toReviewRuleId(prompt: PromptFile): string {
  const pack = prompt.pack || 'Default';
  return `${pack}.${prompt.meta.id}`;
}

/**
 * Converts a single PromptFile into a source-backed ReviewRule, mapping only
 * fields that belong in the neutral contract. Legacy `meta.type`, `evaluator`,
 * `criteria`, and judge/rubric fields are intentionally NOT copied.
 */
function toReviewRule(prompt: PromptFile): ReviewRule {
  const rule: ReviewRule = {
    id: toReviewRuleId(prompt),
    source: prompt.fullPath,
    body: prompt.body,
  };
  if (prompt.meta.name !== undefined) {
    rule.name = prompt.meta.name;
  }
  // Severity is a string enum whose values ('error' | 'warning') match
  // ReviewSeverity exactly, so it maps cleanly without transformation.
  if (prompt.meta.severity !== undefined) {
    rule.severity = prompt.meta.severity;
  }
  return rule;
}

/**
 * Builds a {@link ReviewRequest} from existing {@link PromptFile}s plus a
 * target. This is the conservative bridge Phase 4 uses to convert the current
 * prompt pipeline into the review contract without changing how prompts load.
 * Throws a {@link ValidationError} when no prompts are supplied.
 */
export function buildReviewRequest(params: BuildReviewRequestParams): ReviewRequest {
  const { target, prompts, context } = params;
  if (prompts.length === 0) {
    throw new ValidationError('buildReviewRequest requires at least one prompt.');
  }

  const config = params.config;
  const request: ReviewRequest = {
    target,
    rules: prompts.map(toReviewRule),
    budget: config?.budget ?? DEFAULT_REVIEW_BUDGET,
    outputPolicy: config?.outputPolicy ?? DEFAULT_REVIEW_OUTPUT_POLICY,
    modelCall: config?.modelCall ?? 'auto',
  };
  if (context !== undefined) {
    request.context = context;
  }
  return request;
}
