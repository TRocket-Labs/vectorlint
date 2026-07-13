import { describe, expect, it } from 'vitest';
import {
  REVIEW_DIAGNOSTIC_SCHEMA,
  REVIEW_FINDING_SCHEMA,
  REVIEW_RESULT_SCHEMA,
} from '../../src/review';

describe('ReviewFinding schema', () => {
  it('parses a complete finding', () => {
    const finding = REVIEW_FINDING_SCHEMA.parse({
      ruleId: 'VectorLint.Consistency',
      ruleSource: '/repo/presets/VectorLint/consistency.md',
      severity: 'warning',
      message: 'Vague advice.',
      line: 5,
      column: 1,
      match: 'consider leveraging',
      analysis: 'too vague',
      suggestion: 'be specific',
      fix: 'consider using concrete terms',
    });
    expect(finding.line).toBe(5);
    expect(finding.match).toBe('consider leveraging');
    expect(finding.severity).toBe('warning');
  });

  it('rejects a finding with an unknown severity', () => {
    expect(() =>
      REVIEW_FINDING_SCHEMA.parse({
        ruleId: 'P.R',
        ruleSource: '/x.md',
        severity: 'critical',
        message: 'x',
        line: 1,
        column: 1,
        match: 'x',
      }),
    ).toThrow();
  });

  it('rejects a finding missing required anchored match evidence', () => {
    expect(() =>
      REVIEW_FINDING_SCHEMA.parse({
        ruleId: 'P.R',
        ruleSource: '/x.md',
        severity: 'warning',
        message: 'x',
        line: 1,
        column: 1,
      }),
    ).toThrow();
  });
});

describe('ReviewDiagnostic schema', () => {
  it('parses a diagnostic with level/code/message', () => {
    const diag = REVIEW_DIAGNOSTIC_SCHEMA.parse({
      level: 'warn',
      code: 'finding-evidence-not-locatable',
      message: 'could not anchor the finding',
    });
    expect(diag.level).toBe('warn');
  });

  it('rejects an unknown level', () => {
    expect(() =>
      REVIEW_DIAGNOSTIC_SCHEMA.parse({ level: 'fatal', code: 'x', message: 'y' }),
    ).toThrow();
  });
});

describe('ReviewResult schema', () => {
  it('accepts findings/scores/diagnostics and defaults usage to undefined', () => {
    const result = REVIEW_RESULT_SCHEMA.parse({ findings: [], scores: [], diagnostics: [] });
    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.usage).toBeUndefined();
  });

  it('keeps diagnostics mandatory', () => {
    expect(() =>
      REVIEW_RESULT_SCHEMA.parse({ findings: [], scores: [] }),
    ).toThrow();
  });

  it('accepts usage when provided', () => {
    const result = REVIEW_RESULT_SCHEMA.parse({
      findings: [],
      scores: [],
      diagnostics: [],
      usage: { modelCalls: 2, inputTokens: 10, outputTokens: 5 },
    });
    expect(result.usage?.modelCalls).toBe(2);
  });
});
