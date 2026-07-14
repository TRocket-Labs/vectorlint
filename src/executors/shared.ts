import path from 'path';

import { Severity } from '../evaluators/types';
import type { EvalContext } from '../providers/request-builder';
import { BudgetExceededError } from '../review/budget';
import type {
  ReviewDiagnostic,
  ReviewRequest,
  ReviewSeverity,
  ReviewUsage,
} from '../review/types';

/**
 * Stable diagnostic code recorded when a run stops because the model-call
 * budget was exhausted before every rule could be reviewed.
 */
export const REVIEW_BUDGET_EXCEEDED_CODE = 'review-budget-exceeded';

/**
 * Mutable run-wide counters shared across rules (and chunks/sections) by both
 * the single and agent model-call executors.
 */
export interface RunCounters {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Splits a `Pack.RuleId` review rule id into its `pack` and `ruleId` parts.
 * The review contract carries the composite id, while {@link processFindings}
 * rebuilds the same id from the parts via `buildRuleId`. Splits on the first
 * dot; pack names are single path segments and rule ids are PascalCase.
 */
export function splitRuleId(id: string): { pack: string; ruleId: string } {
  const dot = id.indexOf('.');
  if (dot === -1) {
    return { pack: id, ruleId: id };
  }
  return { pack: id.slice(0, dot), ruleId: id.slice(dot + 1) };
}

/**
 * Builds the provider {@link EvalContext} (file-type hint) for a target URI.
 * Shared by both executors so structured and tool-calling calls receive the
 * same file-type context for directive substitution.
 */
export function buildEvalContext(uri: string): EvalContext {
  const ext = path.extname(uri);
  return ext ? { fileType: ext } : {};
}

/**
 * Maps the review contract's plain {@link ReviewSeverity} union onto the
 * finding processor's {@link Severity} enum at the executor boundary (no
 * unsafe cast).
 */
export function toFindingSeverity(severity: ReviewSeverity): Severity {
  return severity === 'error' ? Severity.ERROR : Severity.WARNING;
}

/**
 * Aggregates run-wide counters into a {@link ReviewUsage}, including token
 * counts only when the output policy opts in to usage reporting.
 */
export function buildReviewUsage(
  request: ReviewRequest,
  counters: RunCounters,
  wallClockMs: number,
): ReviewUsage {
  const usage: ReviewUsage = { modelCalls: counters.modelCalls, wallClockMs };
  if (request.outputPolicy.includeUsage) {
    usage.inputTokens = counters.inputTokens;
    usage.outputTokens = counters.outputTokens;
  }
  return usage;
}

/**
 * Returns a `review-budget-exceeded` error diagnostic when `error` is a
 * {@link BudgetExceededError}; otherwise returns `undefined` so the caller can
 * rethrow non-budget errors unchanged. Shared by both executors' run loops so
 * budget exhaustion surfaces as a partial-result operational failure instead
 * of throwing past the {@link ReviewExecutor} contract.
 */
export function budgetExceededDiagnostic(error: unknown): ReviewDiagnostic | undefined {
  if (!(error instanceof BudgetExceededError)) {
    return undefined;
  }
  return {
    level: 'error',
    code: REVIEW_BUDGET_EXCEEDED_CODE,
    message: error.message,
    context: { limit: error.limit, actual: error.actual },
  };
}
