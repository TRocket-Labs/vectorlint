import { describe, it, expect, vi } from 'vitest';

const MOCK_GENERATE_TEXT = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText: MOCK_GENERATE_TEXT };
});

import { runAgentExecutor } from '../../src/agent/agent-executor';
import type { LanguageModel } from 'ai';

const MOCK_MODEL = {} as unknown as LanguageModel;
const MOCK_CWD = '/fake/repo';
const MOCK_TOOLS = {
  read_file: { description: 'read', execute: vi.fn() },
  search_content: { description: 'search content', execute: vi.fn() },
  search_files: { description: 'search files', execute: vi.fn() },
  list_directory: { description: 'list', execute: vi.fn() },
  lint: { description: 'lint', execute: vi.fn() },
};

function makeRule(id: string, body: string) {
  return {
    id,
    filename: `${id}.md`,
    fullPath: `/rules/${id}.md`,
    pack: 'Test',
    body,
    meta: { id, name: id },
  };
}

describe('runAgentExecutor', () => {
  it('returns findings from agent structured output', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValueOnce({
      output: {
        findings: [
          {
            kind: 'inline',
            file: 'docs/quickstart.md',
            startLine: 5,
            endLine: 5,
            message: 'Passive voice found',
            ruleId: 'PassiveVoice',
          },
        ],
      },
    });

    const rule = makeRule('PassiveVoice', 'Check for passive voice');
    const result = await runAgentExecutor({
      rule: rule as never,
      cwd: MOCK_CWD,
      model: MOCK_MODEL,
      tools: MOCK_TOOLS as never,
      diffContext: 'Changed: docs/quickstart.md',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.kind).toBe('inline');
    expect(result.ruleId).toBe('PassiveVoice');
  });

  it('returns empty findings when agent finds nothing', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValueOnce({
      output: { findings: [] },
    });

    const rule = makeRule('Consistency', 'Check terminology');
    const result = await runAgentExecutor({
      rule: rule as never,
      cwd: MOCK_CWD,
      model: MOCK_MODEL,
      tools: MOCK_TOOLS as never,
      diffContext: '',
    });

    expect(result.findings).toHaveLength(0);
    expect(result.ruleId).toBe('Consistency');
  });
});
