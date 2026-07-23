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
    ruleId: 'RulePrompt',
    ruleSource: '/repo/prompts/RulePrompt.md',
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
    delete process.env.CONFIDENCE_THRESHOLD;
  });

  afterEach(() => {
    if (originalThreshold === undefined) {
      delete process.env.CONFIDENCE_THRESHOLD;
    } else {
      process.env.CONFIDENCE_THRESHOLD = originalThreshold;
    }
  });

  describe('finding output', () => {
    beforeEach(() => {
      process.env.CONFIDENCE_THRESHOLD = '0.0';
    });

    it('produces verified findings and a density score', () => {
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

      expect(result.scores).toEqual([
        {
          ruleId: 'TestPack.RulePrompt',
          score: 8.0,
          scoreText: '8.0/10',
          severity: 'warning',
          findingCount: 2,
        },
      ]);

      expect(result.findings).toHaveLength(2);
      expect(result.findings[0]).toMatchObject({
        ruleId: 'TestPack.RulePrompt',
        ruleSource: '/repo/prompts/RulePrompt.md',
        severity: 'warning',
        message: 'Issue 1',
        line: 1,
        column: 1,
        match: 'Alpha text',
        suggestion: 'Suggestion 1',
        fix: 'Fix 1',
      });
      expect(result.findings[1]).toMatchObject({
        ruleId: 'TestPack.RulePrompt',
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

  describe('evidence verification', () => {
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
      expect(result.scores[0]?.score).toBe(10.0);
      expect(result.scores[0]?.findingCount).toBe(0);
    });

    it('counts only verified findings toward the score, not raw candidate count', () => {
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

    it('deduplicates candidates that resolve to the same verified anchor', () => {
      const result = processFindings(
        baseInput(
          [
            violation({ quoted_text: 'Alpha text Beta', line: 1 }),
            violation({
              quoted_text: 'Alpha text Beta extra',
              line: 1,
              message: 'duplicate anchor',
            }),
          ],
          { targetContent: 'Alpha text Beta\n' },
        ),
      );

      expect(result.findings).toHaveLength(1);
      expect(result.scores[0]?.findingCount).toBe(1);
    });
  });

  describe('candidate filtering', () => {
    it('drops candidates that fail computeFilterDecision without a diagnostic', () => {
      const result = processFindings(
        baseInput([
          violation({ quoted_text: 'Alpha text', confidence: 0.2 }),
        ]),
      );

      expect(result.findings).toEqual([]);
      expect(result.diagnostics).toEqual([]);
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
      expect(result.findings[0]?.ruleId).toBe('TestPack.RulePrompt');
      expect(result.scores[0]?.ruleId).toBe('TestPack.RulePrompt');
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
      expect(result.findings[0]?.ruleId).toBe('TestPack.RulePrompt.Hedging');
      expect(result.scores[0]?.ruleId).toBe('TestPack.RulePrompt');
    });
  });

  describe('severity resolution', () => {
    it('resolves error severity from the density score and stamps it on findings', () => {
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
