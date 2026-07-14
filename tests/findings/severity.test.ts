import { describe, it, expect } from 'vitest';
import {
  buildRuleId,
  resolveCriterionId,
  resolveSeverity,
} from '../../src/findings/severity';
import { EvaluationType, Severity } from '../../src/evaluators/types';
import type { CheckResult } from '../../src/prompts/schema';

function makeCheckResult(severity: Severity): CheckResult {
  return {
    type: EvaluationType.CHECK,
    final_score: 5,
    percentage: 50,
    violation_count: 1,
    items: [],
    severity,
    message: 'Found 1 issue',
    violations: [],
  };
}

describe('resolveSeverity', () => {
  it('returns the density-derived severity from the check score result', () => {
    expect(resolveSeverity({ scored: makeCheckResult(Severity.WARNING) })).toBe(
      Severity.WARNING,
    );
    expect(resolveSeverity({ scored: makeCheckResult(Severity.ERROR) })).toBe(
      Severity.ERROR,
    );
  });
});

describe('buildRuleId', () => {
  it('builds Pack.Rule when no criterion is given', () => {
    expect(buildRuleId('VectorLint', 'AiPattern')).toBe('VectorLint.AiPattern');
  });

  it('builds Pack.Rule.Criterion when a criterion id is given', () => {
    expect(buildRuleId('VectorLint', 'AiPattern', 'Hedging')).toBe(
      'VectorLint.AiPattern.Hedging',
    );
  });

  it('ignores an empty criterion id', () => {
    expect(buildRuleId('VectorLint', 'AiPattern', '')).toBe(
      'VectorLint.AiPattern',
    );
  });
});

describe('resolveCriterionId', () => {
  const criteria = [
    { id: 'Hedging', name: 'Hedge words' },
    { id: 'Filler', name: 'Filler phrases' },
  ];

  it('maps a criterion name to its declared id', () => {
    expect(resolveCriterionId(criteria, 'Hedge words')).toBe('Hedging');
  });

  it('returns undefined when the name does not match a criterion', () => {
    expect(resolveCriterionId(criteria, 'Unknown')).toBeUndefined();
  });

  it('returns undefined when no criterion name is provided', () => {
    expect(resolveCriterionId(criteria, undefined)).toBeUndefined();
  });

  it('returns undefined when no criteria are declared', () => {
    expect(resolveCriterionId(undefined, 'Hedge words')).toBeUndefined();
  });
});
