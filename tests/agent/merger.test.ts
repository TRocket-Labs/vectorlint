import { describe, it, expect } from 'vitest';
import { mergeFindings } from '../../src/agent/merger';
import type { AgentRunResult } from '../../src/agent/types';
import type { PromptEvaluationResult } from '../../src/prompts/schema';

describe('mergeFindings', () => {
  it('includes lint results tagged with source: lint', () => {
    const lintResult: PromptEvaluationResult = {
      type: 'check',
      violations: [],
      word_count: 100,
    };

    const merged = mergeFindings([{ file: 'docs/a.md', result: lintResult }], []);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('lint');
  });

  it('includes agent findings tagged with source: agent', () => {
    const agentResult: AgentRunResult = {
      ruleId: 'Consistency',
      findings: [
        {
          kind: 'top-level',
          message: 'Terminology inconsistency found',
          ruleId: 'Consistency',
          references: [{ file: 'docs/a.md', startLine: 5 }],
        },
      ],
    };

    const merged = mergeFindings([], [agentResult]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('agent');
  });

  it('combines lint and agent results', () => {
    const lintResult: PromptEvaluationResult = {
      type: 'check',
      violations: [],
      word_count: 50,
    };
    const agentResult: AgentRunResult = {
      ruleId: 'Consistency',
      findings: [{ kind: 'top-level', message: 'issue', ruleId: 'Consistency' }],
    };

    const merged = mergeFindings([{ file: 'docs/b.md', result: lintResult }], [agentResult]);

    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.source)).toContain('lint');
    expect(merged.map((item) => item.source)).toContain('agent');
  });

  it('returns empty array when both inputs are empty', () => {
    expect(mergeFindings([], [])).toHaveLength(0);
  });
});
