import { describe, expect, it } from 'vitest';

describe('agent prompt builder', () => {
  it('builds a non-empty system prompt for valid inputs', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      workspaceRoot: '/workspace',
      fileRuleMatches: [
        { file: 'README.md', ruleSource: 'packs/default/ai-pattern.md' },
        { file: 'README.md', ruleSource: 'packs/default/consistency.md' },
      ],
      availableTools: [
        { name: 'read_file', description: 'Read a file inside the workspace root.' },
        { name: 'lint', description: 'Review a file against a source-backed rule, optionally using an override review instruction for that call.' },
        { name: 'finalize_review', description: 'Finalize review output and close the session.' },
      ],
    });

    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Workspace root: /workspace');
    expect(prompt).toContain('matched rules');
  });

  it('supports optional user instructions without breaking prompt generation', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const withoutUserInstructions = buildAgentSystemPrompt({
      workspaceRoot: '/workspace',
      fileRuleMatches: [{ file: 'README.md', ruleSource: 'packs/default/consistency.md' }],
      availableTools: [
        { name: 'lint', description: 'Review a file against a source-backed rule, optionally using an override review instruction for that call.' },
      ],
    });

    const prompt = buildAgentSystemPrompt({
      workspaceRoot: '/workspace',
      fileRuleMatches: [{ file: 'README.md', ruleSource: 'packs/default/consistency.md' }],
      availableTools: [
        { name: 'lint', description: 'Review a file against a source-backed rule, optionally using an override review instruction for that call.' },
      ],
      userInstructions: 'Always enforce concise phrasing.',
    });

    expect(typeof withoutUserInstructions).toBe('string');
    expect(typeof prompt).toBe('string');
    expect(withoutUserInstructions.length).toBeGreaterThan(0);
    expect(prompt.length).toBeGreaterThan(withoutUserInstructions.length);
  });
});
