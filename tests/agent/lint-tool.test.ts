import { describe, it, expect, vi } from 'vitest';
import { createLintTool } from '../../src/agent/tools';

describe('agent lint tool', () => {
  it('accepts ruleSource instead of ruleKey/ruleId', async () => {
    const runRule = vi.fn(async () => ({
      violations: [
        {
          line: 2,
          message: 'Inconsistent term usage',
        },
      ],
    }));

    const tool = createLintTool({
      ruleRegistry: {
        'packs/default/consistency.md': {
          canonicalRuleId: 'Default.Consistency',
          prompt: 'Use consistent terminology',
        },
      },
      runRule,
    });

    const result = await tool.execute({
      file: 'doc.md',
      ruleSource: 'packs/default/consistency.md',
      context: 'optional context',
    });

    expect(result.violations[0]).toMatchObject({
      line: 2,
      message: expect.any(String),
    });
    expect(runRule).toHaveBeenCalledTimes(1);
  });
});
