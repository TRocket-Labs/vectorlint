import { describe, it, expect } from 'vitest';
import { calculateCheckScore } from '../../src/scoring';
import { Severity } from '../../src/evaluators/types';
import { scoreCheck } from '../../src/findings/scorer';
import type { RawViolation } from '../../src/findings/types';

const FULLY_SUPPORTED_CHECKS = {
  rule_supports_claim: true,
  evidence_exact: true,
  context_supports_violation: true,
  plausible_non_violation: false,
  fix_is_drop_in: true,
  fix_preserves_meaning: true,
};

function violation(overrides: Partial<RawViolation> = {}): RawViolation {
  return {
    analysis: 'Issue',
    message: 'Issue message',
    fix: 'Fix',
    rule_quote: 'Rule quote',
    confidence: 0.9,
    checks: FULLY_SUPPORTED_CHECKS,
    ...overrides,
  };
}

describe('scoreCheck', () => {
  it('returns the same numeric result as calculateCheckScore for the same density', () => {
    const verified = [violation(), violation()];
    const result = scoreCheck({
      verifiedViolations: verified,
      wordCount: 100,
      strictness: 'standard',
      promptSeverity: Severity.WARNING,
    });

    const direct = calculateCheckScore(verified, 100, {
      strictness: 'standard',
      promptSeverity: Severity.WARNING,
    });

    expect(result.score).toBe(direct.final_score);
    expect(result.scoreText).toBe(`${direct.final_score.toFixed(1)}/10`);
    expect(result.severity).toBe(direct.severity);
    expect(result.findingCount).toBe(verified.length);
    expect(result.findingCount).toBe(direct.violation_count);
  });

  it('is driven by the verified finding count, not a raw candidate count', () => {
    // 1 verified violation over 100 words at standard strictness:
    // density 1 -> 100 - 1*10 = 90 -> 9.0/10
    const one = scoreCheck({
      verifiedViolations: [violation()],
      wordCount: 100,
      strictness: 'standard',
    });
    expect(one.score).toBe(9.0);
    expect(one.scoreText).toBe('9.0/10');

    // 2 verified violations -> density 2 -> 100 - 2*10 = 80 -> 8.0/10
    const two = scoreCheck({
      verifiedViolations: [violation(), violation()],
      wordCount: 100,
      strictness: 'standard',
    });
    expect(two.score).toBe(8.0);
    expect(two.findingCount).toBe(2);
  });

  it('resolves error severity from the density score when score is low and prompt severity is error', () => {
    // 20 violations over 100 words at standard strictness:
    // density 20 -> 100 - 20*10 = -100 -> clamp 0 -> 0.0/10 -> prompt severity
    const result = scoreCheck({
      verifiedViolations: Array.from({ length: 20 }, () => violation()),
      wordCount: 100,
      strictness: 'standard',
      promptSeverity: Severity.ERROR,
    });
    expect(result.score).toBe(0);
    expect(result.severity).toBe(Severity.ERROR);
  });

  it('forwards strictness and prompt severity options to calculateCheckScore', () => {
    const verified = [violation()];
    const result = scoreCheck({
      verifiedViolations: verified,
      wordCount: 100,
      strictness: 'strict',
    });
    const direct = calculateCheckScore(verified, 100, { strictness: 'strict' });
    expect(result.score).toBe(direct.final_score);
  });
});
