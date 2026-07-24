import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_BUDGET,
  REVIEW_RULE_SCHEMA,
  buildReviewRequest,
} from '../../src/review';
import { ValidationError } from '../../src/errors';
import { Severity } from '../../src/review/severity';
import type { PromptFile } from '../../src/schemas/prompt-schemas';
import type { ReviewContext, ReviewTarget } from '../../src/review';

function makePrompt(overrides: Partial<PromptFile> = {}): PromptFile {
  return {
    id: 'pseudo-advice',
    filename: 'pseudo-advice.md',
    fullPath: '/repo/presets/VectorLint/pseudo-advice.md',
    meta: {
      id: 'PseudoAdvice',
      name: 'Pseudo Advice',
      severity: Severity.WARNING,
      criteria: [{ id: 'Vague', name: 'Vague advice' }],
    },
    body: 'Check for pseudo advice.',
    pack: 'VectorLint',
    ...overrides,
  };
}

describe('buildReviewRequest', () => {
  const target: ReviewTarget = {
    uri: 'file:///repo/docs/guide.md',
    content: '# Guide',
    contentType: 'text/markdown',
  };

  it('maps one PromptFile to one ReviewRule with default budget and auto modelCall', () => {
    const request = buildReviewRequest({ target, prompts: [makePrompt()] });
    expect(request.modelCall).toBe('auto');
    expect(request.budget).toEqual(DEFAULT_REVIEW_BUDGET);
    expect(request.rules).toHaveLength(1);

    const rule = request.rules[0];
    expect(rule).toBeDefined();
    expect(rule?.id).toBe('VectorLint.PseudoAdvice');
    expect(rule?.source).toBe('/repo/presets/VectorLint/pseudo-advice.md');
    expect(rule?.body).toBe('Check for pseudo advice.');
    expect(rule?.severity).toBe('warning');
    expect(rule?.name).toBe('Pseudo Advice');
    expect(() => REVIEW_RULE_SCHEMA.parse(rule)).not.toThrow();
  });

  it('throws a ValidationError when no prompts are supplied', () => {
    expect(() => buildReviewRequest({ target, prompts: [] })).toThrow(ValidationError);
  });

  it('passes caller-supplied context through unchanged', () => {
    const context: ReviewContext[] = [
      { label: 'glossary', content: 'term a means ...', relation: 'reference' },
    ];
    const request = buildReviewRequest({ target, prompts: [makePrompt()], context });
    expect(request.context).toBe(context);
  });

  it('honors an explicit modelCall override', () => {
    const request = buildReviewRequest({
      target,
      prompts: [makePrompt()],
      config: { modelCall: 'agent' },
    });
    expect(request.modelCall).toBe('agent');
  });

  it('omits severity on the rule when the prompt has none', () => {
    const request = buildReviewRequest({
      target,
      prompts: [
        makePrompt({
          meta: { id: 'PseudoAdvice', name: 'Pseudo Advice' },
        }),
      ],
    });
    const rule = request.rules[0];
    expect(rule).toBeDefined();
    expect(rule && 'severity' in rule).toBe(false);
  });
});
