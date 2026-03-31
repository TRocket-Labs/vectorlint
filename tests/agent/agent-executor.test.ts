import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { runAgentExecutor } from '../../src/agent/agent-executor';
import type { PromptFile } from '../../src/prompts/prompt-loader';

function createPrompt(): PromptFile {
  return {
    id: 'consistency',
    filename: 'consistency.md',
    fullPath: path.join(process.cwd(), 'packs', 'default', 'consistency.md'),
    meta: {
      id: 'Consistency',
      name: 'Consistency',
      type: 'check',
    },
    body: 'Flag terminology drift',
    pack: 'Default',
  };
}

describe('agent executor', () => {
  it('builds deterministic rule-source registry from fileRuleMap', async () => {
    const result = await runAgentExecutor({
      targets: ['doc.md'],
      prompts: [createPrompt()],
      runRule: async () => ({ violations: [] }),
      executeAgent: async ({ finalize_review }) => {
        await finalize_review({ totalFindings: 0 });
      },
    });

    expect(result.validRuleSources.length).toBeGreaterThan(0);
  });

  it('does not require model-provided ruleId for inline findings', async () => {
    const runRule = vi.fn(async () => ({
      violations: [
        {
          line: 2,
          message: 'Term mismatch',
        },
      ],
    }));

    const result = await runAgentExecutor({
      targets: ['doc.md'],
      prompts: [createPrompt()],
      runRule,
      executeAgent: async ({ lint, finalize_review }) => {
        await lint({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await finalize_review({ totalFindings: 1 });
      },
    });

    expect(result.findings[0]?.ruleId).toBe('Default.Consistency');
  });
});
