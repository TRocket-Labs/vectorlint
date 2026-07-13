import { describe, expect, it } from 'vitest';
import { REVIEW_CONTEXT_SCHEMA, REVIEW_RULE_SCHEMA, REVIEW_TARGET_SCHEMA } from '../../src/review';

describe('ReviewTarget schema', () => {
  it('parses a valid target', () => {
    const target = REVIEW_TARGET_SCHEMA.parse({
      uri: 'file:///repo/docs/guide.md',
      content: '# Guide\n\nBody text.',
      contentType: 'text/markdown',
    });
    expect(target.uri).toBe('file:///repo/docs/guide.md');
  });

  it('allows empty content (streaming target)', () => {
    expect(() =>
      REVIEW_TARGET_SCHEMA.parse({ uri: 'file:///x', content: '', contentType: 'text/plain' }),
    ).not.toThrow();
  });

  it('rejects a target missing a uri', () => {
    expect(() =>
      REVIEW_TARGET_SCHEMA.parse({ content: 'x', contentType: 'text/plain' }),
    ).toThrow();
  });
});

describe('ReviewRule schema', () => {
  it('parses a rule with required fields and defaults severity to warning', () => {
    const rule = REVIEW_RULE_SCHEMA.parse({
      id: 'Consistency',
      source: 'VectorLint/consistency.md',
      body: 'Check internal consistency.',
      violationConditions: [
        { id: 'Contradiction', description: 'The target makes mutually inconsistent claims.' },
      ],
    });
    expect(rule.severity).toBe('warning');
    expect(rule.violationConditions?.[0]?.id).toBe('Contradiction');
  });

  it('rejects legacy evaluator and judge criteria fields', () => {
    expect(() =>
      REVIEW_RULE_SCHEMA.parse({
        id: 'Tone',
        source: 'VectorLint/tone.md',
        body: 'Judge whether the tone is good.',
        evaluator: 'judge',
        criteria: [{ id: 'Tone', name: 'Tone quality' }],
      }),
    ).toThrow();
  });

  it('rejects an unknown severity', () => {
    expect(() =>
      REVIEW_RULE_SCHEMA.parse({
        id: 'Tone',
        source: 'VectorLint/tone.md',
        body: 'x',
        severity: 'critical',
      }),
    ).toThrow();
  });
});

describe('ReviewContext schema', () => {
  it('parses caller-supplied scoped content', () => {
    const ctx = REVIEW_CONTEXT_SCHEMA.parse({
      label: 'related-glossary',
      content: 'Term A means ...',
      relation: 'reference',
    });
    expect(ctx.label).toBe('related-glossary');
  });
});
