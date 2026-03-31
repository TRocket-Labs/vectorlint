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
      availableTools: [
        { name: 'read_file', description: 'Read a file inside the repository root.' },
        { name: 'lint', description: 'Run a configured lint rule against a file.' },
        { name: 'finalize_review', description: 'Finalize review output and close the session.' },
      ],
    });

    expect(prompt).toContain('Role: You are a senior technical writer and repository reviewer.');
    expect(prompt).toContain('Operating Policy');
    expect(prompt).toContain('Available tools:');
    expect(prompt).toContain('- read_file: Read a file inside the repository root.');
    expect(prompt).toContain('- lint: Run a configured lint rule against a file.');
    expect(prompt).toContain('- finalize_review: Finalize review output and close the session.');
    expect(prompt).toContain('Finding contract:');
    expect(prompt).toContain('Lint inline violations are persisted automatically when lint succeeds.');
    expect(prompt).toContain('Submit top-level findings with report_finding as soon as evidence is sufficient.');
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
      availableTools: [
        { name: 'lint', description: 'Run a configured lint rule against a file.' },
      ],
      userInstructions: 'Always enforce concise phrasing.',
    });

    expect(prompt).toContain('User Instructions (from VECTORLINT.md):');
    expect(prompt).toContain('Always enforce concise phrasing.');
  });
});
