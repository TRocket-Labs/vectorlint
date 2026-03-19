import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPlanner } from '../../src/agent/planner';
import type { LLMProvider } from '../../src/providers/llm-provider';
import type { PromptFile } from '../../src/schemas/prompt-schemas';

function makeRule(id: string, body: string, mode?: 'lint' | 'agent'): PromptFile {
  return {
    id,
    filename: `${id}.md`,
    fullPath: `/rules/${id}.md`,
    pack: 'Test',
    body,
    meta: { id, name: id, ...(mode && { mode }) },
  };
}

const RUN_PROMPT_STRUCTURED = vi.fn();
const MOCK_PROVIDER: LLMProvider = {
  runPromptStructured: RUN_PROMPT_STRUCTURED,
};

describe('runPlanner', () => {
  beforeEach(() => {
    RUN_PROMPT_STRUCTURED.mockReset();
  });

  it('routes rules with mode: agent to agentTasks', async () => {
    const rule = makeRule('Consistency', 'Check terminology', 'agent');
    const plan = await runPlanner([rule], [], MOCK_PROVIDER);
    expect(plan.agentTasks).toHaveLength(1);
    expect(plan.lintTasks).toHaveLength(0);
    expect(RUN_PROMPT_STRUCTURED).not.toHaveBeenCalled();
  });

  it('routes rules with mode: lint to lintTasks without LLM call', async () => {
    const rule = makeRule('PassiveVoice', 'Check passive voice', 'lint');
    const plan = await runPlanner([rule], ['docs/a.md'], MOCK_PROVIDER);
    expect(plan.lintTasks).toHaveLength(1);
    expect(plan.lintTasks[0]?.targetFiles).toEqual(['docs/a.md']);
    expect(RUN_PROMPT_STRUCTURED).not.toHaveBeenCalled();
  });

  it('calls LLM for rules without mode and classifies correctly', async () => {
    RUN_PROMPT_STRUCTURED.mockResolvedValueOnce({
      data: {
        classifications: [
          {
            ruleId: 'CrossDoc',
            classification: 'agent',
            rationale: 'needs multiple files',
          },
          { ruleId: 'Clarity', classification: 'lint', rationale: 'single page' },
        ],
      },
    });

    const rules = [
      makeRule('CrossDoc', 'Check terminology across all docs'),
      makeRule('Clarity', 'Check sentence clarity'),
    ];

    const plan = await runPlanner(rules, ['docs/a.md'], MOCK_PROVIDER);

    expect(plan.agentTasks).toHaveLength(1);
    expect(plan.agentTasks[0]?.rule.meta.id).toBe('CrossDoc');
    expect(plan.lintTasks).toHaveLength(1);
    expect(plan.lintTasks[0]?.rule.meta.id).toBe('Clarity');
  });

  it('defaults ambiguous rules to lint', async () => {
    RUN_PROMPT_STRUCTURED.mockResolvedValueOnce({
      data: {
        classifications: [
          { ruleId: 'Ambiguous', classification: 'lint', rationale: 'defaulting to lint' },
        ],
      },
    });

    const rule = makeRule('Ambiguous', 'Vague rule that could go either way');
    const plan = await runPlanner([rule], ['docs/a.md'], MOCK_PROVIDER);
    expect(plan.lintTasks).toHaveLength(1);
  });
});
