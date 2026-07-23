import { describe, it, expect } from 'vitest';
import {
  FINDING_PROCESSING_INPUT_SCHEMA,
  PROMPT_META_FOR_FINDINGS_SCHEMA,
  RAW_VIOLATION_SCHEMA,
} from '../../src/findings/types';

const FULLY_SUPPORTED_CHECKS = {
  rule_supports_claim: true,
  evidence_exact: true,
  context_supports_violation: true,
  plausible_non_violation: false,
  fix_is_drop_in: true,
  fix_preserves_meaning: true,
};

function validInput() {
  return {
    pack: 'VectorLint',
    ruleId: 'AiPattern',
    ruleSource: '/repo/presets/VectorLint/ai-pattern.md',
    candidateFindings: [
      {
        line: 1,
        quoted_text: 'leverage synergies',
        context_before: '',
        context_after: '',
        description: 'cliché phrase',
        analysis: 'vague corporate cliché',
        message: 'Avoid cliché phrase',
        suggestion: 'Use concrete verbs',
        fix: 'work together',
        rule_quote: 'Avoid clichés',
        confidence: 0.9,
        checks: FULLY_SUPPORTED_CHECKS,
      },
    ],
    wordCount: 100,
    promptMeta: {
      severity: 'warning' as const,
      strictness: 'standard' as const,
      criteria: [{ id: 'Hedging', name: 'Hedge words' }],
    },
    targetContent: 'leverage synergies everywhere',
  };
}

describe('RAW_VIOLATION_SCHEMA', () => {
  it('parses a representative candidate finding', () => {
    const parsed = RAW_VIOLATION_SCHEMA.parse(validInput().candidateFindings[0]);
    expect(parsed.analysis).toBe('vague corporate cliché');
    expect(parsed.checks?.evidence_exact).toBe(true);
  });

  it('requires analysis', () => {
    expect(() =>
      RAW_VIOLATION_SCHEMA.parse({ message: 'no analysis field' }),
    ).toThrow();
  });
});

describe('PROMPT_META_FOR_FINDINGS_SCHEMA', () => {
  it('rejects unknown fields', () => {
    expect(() =>
      PROMPT_META_FOR_FINDINGS_SCHEMA.parse({
        severity: 'warning',
        unexpected: true,
      }),
    ).toThrow();
  });
});

describe('FINDING_PROCESSING_INPUT_SCHEMA', () => {
  it('parses a representative supported finding-processing input', () => {
    const parsed = FINDING_PROCESSING_INPUT_SCHEMA.parse(validInput());
    expect(parsed.pack).toBe('VectorLint');
    expect(parsed.candidateFindings).toHaveLength(1);
    expect(parsed.promptMeta.criteria?.[0]?.id).toBe('Hedging');
  });

  it('rejects malformed candidate findings', () => {
    expect(() =>
      FINDING_PROCESSING_INPUT_SCHEMA.parse({
        ...validInput(),
        candidateFindings: [{ message: 'no analysis field' }],
      }),
    ).toThrow();
  });

  it('rejects an unknown top-level key', () => {
    expect(() =>
      FINDING_PROCESSING_INPUT_SCHEMA.parse({ ...validInput(), unexpected: true }),
    ).toThrow();
  });
});
