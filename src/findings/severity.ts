import type { ScoredEvaluation } from '../prompts/schema';
import type { FindingsCriterion, RuleSeverity } from './types';

/** Input to {@link resolveSeverity}. */
export interface SeverityInput {
  scored: ScoredEvaluation;
}

/** Resolves severity from a scored evaluation. */
export function resolveSeverity(input: SeverityInput): RuleSeverity {
  return input.scored.severity;
}

/** Builds a `Pack.Rule` or `Pack.Rule.Criterion` output id. */
export function buildRuleId(
  pack: string,
  ruleId: string,
  criterionId?: string,
): string {
  const parts = [pack, ruleId];
  if (criterionId) {
    parts.push(criterionId);
  }
  return parts.join('.');
}

/**
 * Resolves a criterion id from the rule's declared criteria by matching a
 * `criterionName` a violation carries to a declared criterion's `name`.
 * Returns `undefined` when the violation is not attributed to a declared
 * criterion.
 */
export function resolveCriterionId(
  criteria: readonly FindingsCriterion[] | undefined,
  criterionName: string | undefined,
): string | undefined {
  if (!criterionName || !criteria) {
    return undefined;
  }
  const match = criteria.find((c) => c.name === criterionName);
  return match?.id;
}
