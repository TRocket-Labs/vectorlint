import { describe, it, expect, vi, beforeEach } from 'vitest';

const MOCK_GENERATE_TEXT = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: MOCK_GENERATE_TEXT,
  };
});

import type { LanguageModel } from 'ai';
import { runAgentExecutor } from '../../src/agent/agent-executor';
import type { PromptFile } from '../../src/schemas/prompt-schemas';

const MOCK_MODEL = {} as unknown as LanguageModel;
const MOCK_CWD = '/fake/repo';

function makeRule(id: string, body: string): PromptFile {
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
  beforeEach(() => {
    MOCK_GENERATE_TEXT.mockReset();
  });

  it('returns findings from agent output', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValueOnce({
      text: '',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      experimental_output: {
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
      rule,
      cwd: MOCK_CWD,
      model: MOCK_MODEL,
      tools: {} as never,
      diffContext: 'Changed: docs/quickstart.md',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.kind).toBe('inline');
    expect(result.ruleId).toBe('PassiveVoice');
  });

  it('returns empty findings when agent finds nothing', async () => {
    MOCK_GENERATE_TEXT.mockResolvedValueOnce({
      text: 'No issues found.',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      experimental_output: { findings: [] },
    });

    const rule = makeRule('Consistency', 'Check terminology');
    const result = await runAgentExecutor({
      rule,
      cwd: MOCK_CWD,
      model: MOCK_MODEL,
      tools: {} as never,
      diffContext: '',
    });

    expect(result.findings).toHaveLength(0);
  });
});
