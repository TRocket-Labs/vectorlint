import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { createLintTool } from '../../src/agent/tools/lint-tool';

const TMP = path.join(process.cwd(), 'tmp-lint-tool-test');

const EVALUATE_MOCK = vi.hoisted(() => vi.fn());
const CREATE_EVALUATOR_MOCK = vi.hoisted(() => vi.fn(() => ({ evaluate: EVALUATE_MOCK })));

vi.mock('../../src/evaluators/index', () => ({
  createEvaluator: CREATE_EVALUATOR_MOCK,
}));

const RULE = {
  id: 'RuleA',
  filename: 'rule-a.md',
  fullPath: '/rules/rule-a.md',
  pack: 'PackA',
  body: 'Original rule body',
  meta: {
    id: 'RuleA',
    name: 'Rule A',
    type: 'check',
    severity: 'error',
  },
} as const;

const OTHER_RULE = {
  id: 'RuleB',
  filename: 'rule-b.md',
  fullPath: '/rules/rule-b.md',
  pack: 'PackA',
  body: 'Other rule body',
  meta: {
    id: 'RuleB',
    name: 'Rule B',
    type: 'check',
    severity: 'warning',
  },
} as const;

describe('createLintTool', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    writeFileSync(path.join(TMP, 'doc.md'), 'Hello world');
    EVALUATE_MOCK.mockReset();
    CREATE_EVALUATOR_MOCK.mockClear();
  });

  it('rejects empty ruleContent', async () => {
    const tool = createLintTool(TMP, RULE as never, {
      runPromptStructured: vi.fn(),
    } as never);

    await expect(
      tool.execute({ file: 'doc.md', ruleContent: '   ' }),
    ).rejects.toThrow('ruleContent must not be empty');
  });

  it('requires ruleId when using a rules catalog', async () => {
    const tool = createLintTool(TMP, new Map([
      [RULE.meta.id, RULE],
    ]) as never, {
      runPromptStructured: vi.fn(),
    } as never);

    await expect(
      tool.execute({ file: 'doc.md', ruleContent: 'Check for explicit examples.' }),
    ).rejects.toThrow('ruleId is required when lint is configured with a rules catalog.');
  });

  it('rejects unknown ruleId when using a rules catalog', async () => {
    const tool = createLintTool(TMP, new Map([
      [RULE.meta.id, RULE],
    ]) as never, {
      runPromptStructured: vi.fn(),
    } as never);

    await expect(
      tool.execute({
        file: 'doc.md',
        ruleId: 'MissingRule',
        ruleContent: 'Check for explicit examples.',
      }),
    ).rejects.toThrow('Unknown ruleId: MissingRule');
  });

  it('passes ruleContent and context into evaluator body', async () => {
    EVALUATE_MOCK.mockResolvedValue({
      type: 'judge',
      final_score: 7,
      criteria: [
        {
          name: 'Criterion',
          weight: 1,
          score: 3,
          normalized_score: 7.5,
          weighted_points: 3,
          summary: '',
          reasoning: '',
          violations: [
            {
              line: 2,
              message: 'Issue from judge path',
            },
          ],
        },
      ],
    } as never);

    const tool = createLintTool(TMP, RULE as never, {
      runPromptStructured: vi.fn(),
    } as never);

    const result = await tool.execute({
      file: 'doc.md',
      ruleContent: 'Check for explicit examples.',
      context: 'External evidence: examples are missing in companion guide.',
    });

    const evaluatorPrompt = CREATE_EVALUATOR_MOCK.mock.calls[0]?.[2] as { body: string } | undefined;
    expect(evaluatorPrompt?.body).toContain('Check for explicit examples.');
    expect(evaluatorPrompt?.body).toContain('Additional grounding context');
    expect(evaluatorPrompt?.body).toContain('External evidence: examples are missing in companion guide.');

    expect(result.score).toBe(7);
    expect(result.violationCount).toBe(1);
    expect(result.violations[0]).toEqual({ line: 2, message: 'Issue from judge path' });
  });

  it('routes evaluation by ruleId from a rules catalog', async () => {
    EVALUATE_MOCK.mockResolvedValue({
      type: 'judge',
      final_score: 9,
      criteria: [],
    } as never);

    const tool = createLintTool(TMP, new Map([
      [RULE.meta.id, RULE],
      [OTHER_RULE.meta.id, OTHER_RULE],
    ]) as never, {
      runPromptStructured: vi.fn(),
    } as never);

    const result = await tool.execute({
      file: 'doc.md',
      ruleId: OTHER_RULE.meta.id,
      ruleContent: 'Check for explicit examples.',
    });

    const evaluatorPrompt = CREATE_EVALUATOR_MOCK.mock.calls[0]?.[2] as { meta: { id: string }; body: string } | undefined;
    expect(evaluatorPrompt?.meta.id).toBe(OTHER_RULE.meta.id);
    expect(evaluatorPrompt?.body).toContain('Check for explicit examples.');
    expect(result.score).toBe(9);
    expect(result.violationCount).toBe(0);
    expect(result.violations).toEqual([]);
  });
});
