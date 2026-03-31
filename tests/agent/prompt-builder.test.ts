import { describe, expect, it } from 'vitest';

describe('agent prompt builder', () => {
  it('includes vcli-agent-mode style role, policy, tools, and contract sections', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      repositoryRoot: '/repo',
      targets: ['README.md'],
      availableRuleSources: [
        'packs/default/ai-pattern.md',
        'packs/default/consistency.md',
      ],
    });

    expect(prompt).toContain('Role: You are a senior technical writer and repository reviewer.');
    expect(prompt).toContain('Operating Policy');
    expect(prompt).toContain('Available tools:');
    expect(prompt).toContain('Finding contract:');
    expect(prompt).toContain('Requested review targets:');
    expect(prompt).toContain('- README.md');
    expect(prompt).toContain('Available ruleSources:');
    expect(prompt).toContain('- packs/default/ai-pattern.md');
    expect(prompt).toContain('- packs/default/consistency.md');
    expect(prompt).toContain('Current date:');
    expect(prompt).toContain('Repo root: /repo');
    expect(prompt).toContain('finalize_review');
  });

  it('includes configured user instructions in a dedicated section', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      repositoryRoot: '/repo',
      targets: ['README.md'],
      availableRuleSources: ['packs/default/consistency.md'],
      userInstructions: 'Always enforce concise phrasing.',
    });

    expect(prompt).toContain('User Instructions (from VECTORLINT.md):');
    expect(prompt).toContain('Always enforce concise phrasing.');
  });
});
