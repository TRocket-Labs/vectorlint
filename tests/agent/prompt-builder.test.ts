import { describe, expect, it } from 'vitest';

describe('agent prompt builder', () => {
  it('builds a non-empty system prompt for valid inputs', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      repositoryRoot: '/repo',
      targets: ['README.md'],
      availableRuleSources: [
        'packs/default/ai-pattern.md',
        'packs/default/consistency.md',
      ],
      availableTools: [
        { name: 'read_file', description: 'Read a file inside the repository root.' },
        { name: 'lint', description: 'Run a configured lint rule against a file.' },
        { name: 'finalize_review', description: 'Finalize review output and close the session.' },
      ],
    });

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('supports optional user instructions without breaking prompt generation', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const withoutUserInstructions = buildAgentSystemPrompt({
      repositoryRoot: '/repo',
      targets: ['README.md'],
      availableRuleSources: ['packs/default/consistency.md'],
      availableTools: [
        { name: 'lint', description: 'Run a configured lint rule against a file.' },
      ],
    });

    const prompt = buildAgentSystemPrompt({
      repositoryRoot: '/repo',
      targets: ['README.md'],
      availableRuleSources: ['packs/default/consistency.md'],
      availableTools: [
        { name: 'lint', description: 'Run a configured lint rule against a file.' },
      ],
      userInstructions: 'Always enforce concise phrasing.',
    });

    expect(typeof withoutUserInstructions).toBe('string');
    expect(typeof prompt).toBe('string');
    expect(withoutUserInstructions.length).toBeGreaterThan(0);
    expect(prompt.length).toBeGreaterThan(withoutUserInstructions.length);
  });
});
