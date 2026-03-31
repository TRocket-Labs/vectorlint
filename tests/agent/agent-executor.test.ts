import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
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
      runRule: () => Promise.resolve({ violations: [] }),
      executeAgent: async ({ finalize_review }) => {
        await finalize_review({ totalFindings: 0 });
      },
    });

    expect(result.validRuleSources.length).toBeGreaterThan(0);
  });

  it('does not require model-provided ruleId for inline findings', async () => {
    const runRule = vi.fn(() => Promise.resolve({
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

  it('records inline findings from lint tool output without report_finding call', async () => {
    const result = await runAgentExecutor({
      targets: ['doc.md'],
      prompts: [createPrompt()],
      runRule: () => Promise.resolve({
        violations: [
          {
            line: 2,
            message: 'Term mismatch',
          },
        ],
      }),
      executeAgent: async ({ lint, finalize_review }) => {
        await lint({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await finalize_review({ totalFindings: 1 });
      },
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.kind).toBe('inline');
  });

  it('appends finding_recorded_inline events to session jsonl', async () => {
    const tempHome = mkdtempSync(path.join(tmpdir(), 'vectorlint-agent-executor-'));

    const result = await runAgentExecutor({
      targets: ['doc.md'],
      prompts: [createPrompt()],
      homeDir: tempHome,
      runRule: () => Promise.resolve({
        violations: [
          {
            line: 2,
            message: 'Term mismatch',
          },
        ],
      }),
      executeAgent: async ({ lint, finalize_review }) => {
        await lint({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await finalize_review({ totalFindings: 1 });
      },
    });

    const raw = readFileSync(result.sessionFilePath, 'utf-8');
    const events = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { eventType: string });

    expect(events.some((event) => event.eventType === 'finding_recorded_inline')).toBe(true);
  });

  it('fails hard when finalize_review is not called', async () => {
    const result = await runAgentExecutor({
      targets: ['doc.md'],
      prompts: [createPrompt()],
      runRule: () => Promise.resolve({ violations: [] }),
      executeAgent: async ({ lint }) => {
        await lint({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
      },
    });

    expect(result.error).toContain('finalize_review was not called');
  });
});
