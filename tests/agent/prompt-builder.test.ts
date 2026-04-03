import { describe, expect, it } from 'vitest';

describe('agent prompt builder', () => {
  it('builds a non-empty system prompt for valid inputs', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      workspaceRoot: '/workspace',
      matchedRuleUnits: [
        {
          file: 'README.md',
          rules: [
            { ruleSource: 'packs/default/ai-pattern.md' },
            { ruleSource: 'packs/default/consistency.md' },
          ],
          estimatedTokens: 42,
        },
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
    expect(prompt).toContain('Review files and Matched Rule Units');
  });

  it('renders grouped member lists explicitly per file', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const prompt = buildAgentSystemPrompt({
      workspaceRoot: '/workspace',
      matchedRuleUnits: [
        {
          file: 'README.md',
          rules: [
            { ruleSource: 'packs/default/ai-pattern.md' },
            { ruleSource: 'packs/default/consistency.md' },
          ],
          estimatedTokens: 42,
        },
        {
          file: 'README.md',
          rules: [{ ruleSource: 'packs/default/unsupported-claims.md' }],
          estimatedTokens: 24,
        },
        {
          file: 'docs/guide.md',
          rules: [{ ruleSource: 'packs/default/links.md' }],
          estimatedTokens: 16,
        },
      ],
      availableTools: [
        { name: 'lint', description: 'Review a file against a source-backed rule, optionally using an override review instruction for that call.' },
      ],
    });

    expect(prompt).toContain('- README.md');
    expect(prompt).toContain('  - Matched Rule Unit:');
    expect(prompt).toContain('    - packs/default/ai-pattern.md');
    expect(prompt).toContain('    - packs/default/consistency.md');
    expect(prompt).toContain('    - packs/default/unsupported-claims.md');
    expect(prompt).toContain('- docs/guide.md');
    expect(prompt).toContain('    - packs/default/links.md');
  });

  it('supports optional user instructions without breaking prompt generation', async () => {
    const { buildAgentSystemPrompt } = await import('../../src/agent/prompt-builder');

    const withoutUserInstructions = buildAgentSystemPrompt({
      workspaceRoot: '/workspace',
      matchedRuleUnits: [
        {
          file: 'README.md',
          rules: [{ ruleSource: 'packs/default/consistency.md' }],
          estimatedTokens: 20,
        },
      ],
      availableTools: [
        { name: 'lint', description: 'Review a file against a source-backed rule, optionally using an override review instruction for that call.' },
      ],
    });

    const prompt = buildAgentSystemPrompt({
      workspaceRoot: '/workspace',
      matchedRuleUnits: [
        {
          file: 'README.md',
          rules: [{ ruleSource: 'packs/default/consistency.md' }],
          estimatedTokens: 20,
        },
      ],
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
