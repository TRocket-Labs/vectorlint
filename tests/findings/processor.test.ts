import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processFindings } from '../../src/findings/processor';
import { FINDING_EVIDENCE_NOT_LOCATABLE } from '../../src/findings/finding-evidence-verifier';
import { REVIEW_RESULT_SCHEMA } from '../../src/review';
import type {
  FindingProcessingInput,
  RawViolation,
} from '../../src/findings/types';

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
    line: 1,
    quoted_text: 'Alpha text',
    context_before: '',
    context_after: '',
    analysis: 'Issue 1',
    message: 'Issue 1',
    suggestion: 'Suggestion 1',
    fix: 'Fix 1',
    rule_quote: 'Rule quote',
    confidence: 0.9,
    checks: FULLY_SUPPORTED_CHECKS,
    ...overrides,
  };
}

function baseInput(
  candidateFindings: RawViolation[],
  overrides: Partial<FindingProcessingInput> = {},
): FindingProcessingInput {
  return {
    pack: 'TestPack',
    ruleId: 'CheckPrompt',
    ruleSource: '/repo/prompts/CheckPrompt.md',
    candidateFindings,
    wordCount: 100,
    promptMeta: { severity: 'warning', strictness: 'standard' },
    targetContent: 'Alpha text\nBeta text\n',
    ...overrides,
  };
}

describe('processFindings', () => {
  const originalThreshold = process.env.CONFIDENCE_THRESHOLD;

  beforeEach(() => {
    // Default threshold (0.75) unless a test opts in.
    delete process.env.CONFIDENCE_THRESHOLD;
  });

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.CONFIDENCE_THRESHOLD;
    } else {
      process.env.CONFIDENCE_THRESHOLD = originalThreshold;
    }
  });

  describe('golden objective-check output', () => {
    beforeEach(() => {
      // Surface every gate-passing candidate regardless of confidence.
      process.env.CONFIDENCE_THRESHOLD = '0.0';
    });

    it('produces byte-for-byte findings/score matching the standard orchestrator path', () => {
      const input = baseInput([
        violation(),
        violation({
          line: 2,
          quoted_text: 'Beta text',
          analysis: 'Issue 2',
          message: 'Issue 2',
          suggestion: 'Suggestion 2',
          fix: 'Fix 2',
        }),
      ]);

      const result = processFindings(input);

      // Score: density 2/100 at standard strictness (10) -> 100 - 20 -> 8.0/10.
      expect(result.scores).toEqual([
        {
          ruleId: 'TestPack.CheckPrompt',
          score: 8.0,
          scoreText: '8.0/10',
          severity: 'warning',
          findingCount: 2,
        },
      ]);

      // Findings: Pack.Rule (check violations carry no criterion name),
      // anchored lines/columns/match.
      expect(result.findings).toHaveLength(2);
      expect(result.findings[0]).toMatchObject({
        ruleId: 'TestPack.CheckPrompt',
        ruleSource: '/repo/prompts/CheckPrompt.md',
        severity: 'warning',
        message: 'Issue 1',
        line: 1,
        column: 1,
        match: 'Alpha text',
        suggestion: 'Suggestion 1',
        fix: 'Fix 1',
      });
      expect(result.findings[1]).toMatchObject({
        ruleId: 'TestPack.CheckPrompt',
        severity: 'warning',
        message: 'Issue 2',
        line: 2,
        column: 1,
        match: 'Beta text',
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.hadOperationalErrors).toBe(false);
    });

    it('returns a ReviewResult that validates against the review contract', () => {
      const result = processFindings(baseInput([violation()]));
      expect(() => REVIEW_RESULT_SCHEMA.parse(result)).not.toThrow();
    });
  });

  describe('evidence verification (audit Finding #6)', () => {
    beforeEach(() => {
      process.env.CONFIDENCE_THRESHOLD = '0.0';
    });

    it('turns unanchored evidence into a warn diagnostic and emits no finding', () => {
      const result = processFindings(
        baseInput([
          violation({ quoted_text: 'this quote is not in the content' }),
        ]),
      );

      expect(result.findings).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe(FINDING_EVIDENCE_NOT_LOCATABLE);
      expect(result.diagnostics[0]?.level).toBe('warn');
      // Score reflects 0 verified findings -> perfect 10.0/10.
      expect(result.scores[0]?.score).toBe(10.0);
      expect(result.scores[0]?.findingCount).toBe(0);
    });

    it('counts only verified findings toward the score, not raw candidate count', () => {
      // One anchored + one unanchored candidate. Verified count = 1.
      // Density 1/100 -> 100 - 10 -> 9.0/10 (the intentional fix).
      const result = processFindings(
        baseInput([
          violation({ quoted_text: 'Alpha text' }),
          violation({ quoted_text: 'nowhere to be found' }),
        ]),
      );

      expect(result.findings).toHaveLength(1);
      expect(result.scores[0]?.score).toBe(9.0);
      expect(result.scores[0]?.findingCount).toBe(1);
      expect(result.diagnostics).toHaveLength(1);
    });

    it('does not set hadOperationalErrors for warn-level evidence diagnostics', () => {
      const result = processFindings(
        baseInput([violation({ quoted_text: 'missing' })]),
      );
      expect(result.diagnostics[0]?.level).toBe('warn');
      expect(result.hadOperationalErrors).toBe(false);
    });

    it('deduplicates verified findings by quoted_text and line', () => {
      const result = processFindings(
        baseInput([
          violation({ quoted_text: 'Alpha text', line: 1 }),
          violation({ quoted_text: 'Alpha text', line: 1, message: 'dup' }),
        ]),
      );

      expect(result.findings).toHaveLength(1);
      expect(result.scores[0]?.findingCount).toBe(1);
    });
  });

  describe('candidate filtering', () => {
    it('drops candidates that fail computeFilterDecision without a diagnostic', () => {
      // Default threshold 0.75: confidence 0.2 is filtered out.
      const result = processFindings(
        baseInput([
          violation({ quoted_text: 'Alpha text', confidence: 0.2 }),
        ]),
      );

      expect(result.findings).toEqual([]);
      expect(result.diagnostics).toEqual([]);
      // No verified findings -> 10.0/10.
      expect(result.scores[0]?.findingCount).toBe(0);
    });

    it('filtered candidates do not contribute to the score count', () => {
      const result = processFindings(
        baseInput([
          violation({ quoted_text: 'Alpha text', confidence: 0.9 }),
          violation({ quoted_text: 'Beta text', line: 2, confidence: 0.2 }),
        ]),
      );

      expect(result.findings).toHaveLength(1);
      expect(result.scores[0]?.findingCount).toBe(1);
      expect(result.scores[0]?.score).toBe(9.0);
    });
  });

  describe('rule id building', () => {
    beforeEach(() => {
      process.env.CONFIDENCE_THRESHOLD = '0.0';
    });

    it('attributes findings to Pack.Rule when violations carry no criterion name', () => {
      const result = processFindings(baseInput([violation({ quoted_text: 'Alpha text' })]));
      expect(result.findings[0]?.ruleId).toBe('TestPack.CheckPrompt');
      expect(result.scores[0]?.ruleId).toBe('TestPack.CheckPrompt');
    });

    it('attributes findings to Pack.Rule.Criterion when a violation names a declared criterion', () => {
      const result = processFindings(
        baseInput(
          [
            violation({
              quoted_text: 'Alpha text',
              criterionName: 'Hedge words',
            }),
          ],
          {
            promptMeta: {
              severity: 'warning',
              strictness: 'standard',
              criteria: [{ id: 'Hedging', name: 'Hedge words' }],
            },
          },
        ),
      );
      expect(result.findings[0]?.ruleId).toBe('TestPack.CheckPrompt.Hedging');
      // The score stays at Pack.Rule (no criterion), matching the orchestrator.
      expect(result.scores[0]?.ruleId).toBe('TestPack.CheckPrompt');
    });
  });

  describe('severity resolution', () => {
    it('resolves error severity from the density score and stamps it on findings', () => {
      // 20 verified violations over 100 words -> 0.0/10 -> prompt severity error.
      const result = processFindings(
        baseInput(
          Array.from({ length: 20 }, (_, i) =>
            violation({
              quoted_text: `Alpha text${i}`,
              analysis: `Issue ${i}`,
              message: `Issue ${i}`,
            }),
          ),
          {
            targetContent: Array.from({ length: 20 }, (_, i) => `Alpha text${i}`).join('\n') + '\n',
            promptMeta: { severity: 'error', strictness: 'standard' },
          },
        ),
      );

      expect(result.scores[0]?.severity).toBe('error');
      expect(result.findings.every((f) => f.severity === 'error')).toBe(true);
    });
  });
});
