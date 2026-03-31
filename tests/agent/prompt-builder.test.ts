import { describe, expect, it } from 'vitest';

describe('agent prompt builder', () => {
  it('includes review contract sections in the generated system prompt', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      repositoryRoot: '/repo',
      targets: ['README.md'],
      availableRuleSources: [
        'packs/default/ai-pattern.md',
        'packs/default/consistency.md',
      ],
    });

    expect(prompt).toContain('Repository root: /repo');
    expect(prompt).toContain('Targets: README.md');
    expect(prompt).toContain('Available ruleSources');
    expect(prompt).toContain('finalize_review');
  });

  it('includes configured user instructions in the generated system prompt', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      repositoryRoot: '/repo',
      targets: ['README.md'],
      availableRuleSources: ['packs/default/consistency.md'],
      userInstructions: 'Always enforce concise phrasing.',
    });

    expect(prompt).toContain('User Instructions');
    expect(prompt).toContain('Always enforce concise phrasing.');
  });
});
