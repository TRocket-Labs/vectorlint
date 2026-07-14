import type { CheckResult } from '../prompts/schema';
import type { FindingsCriterion, RuleSeverity } from './types';

/** Input to {@link resolveSeverity}. */
export interface SeverityInput {
  scored: CheckResult;
}

/**
 * The one severity resolution path for objective violation checks
 * (audit Finding #4). Severity is derived from the existing count/density
 * score result (`CheckResult.severity`); there is no agent-specific or
 * mode-specific severity stamping here.
 */
export function resolveSeverity(input: SeverityInput): RuleSeverity {
  return input.scored.severity;
}

/**
 * Builds the hierarchical output rule id matching the current standard
 * orchestrator naming (`buildRuleName`): `Pack.Rule` or, when a violation is
 * attributed to a criterion, `Pack.Rule.Criterion`. This is a faithful port of
 * that behavior; it does not import from `src/agent/`.
 */
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
 * criterion (the common case for objective check violations).
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
