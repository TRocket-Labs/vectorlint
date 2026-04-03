import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../src/prompts/prompt-loader';

function makePrompt(ruleSource: string, body: string): PromptFile {
  const filename = ruleSource.split('/').pop() ?? 'rule.md';
  const basename = filename.replace(/\.md$/i, '');
  return {
    id: basename,
    filename,
    fullPath: ruleSource,
    pack: 'Default',
    body,
    meta: {
      id: basename,
      name: basename,
      type: 'check',
      severity: 'warning',
    },
  };
}

describe('matched rule units', () => {
  it('groups matched rules deterministically for the same inputs and budget', async () => {
    const { buildMatchedRuleUnits } = await import('../../src/agent/rule-units');

    const promptBySource = new Map<string, PromptFile>([
      ['packs/default/ai-pattern.md', makePrompt('packs/default/ai-pattern.md', 'A'.repeat(40))],
      ['packs/default/consistency.md', makePrompt('packs/default/consistency.md', 'B'.repeat(40))],
      ['packs/default/links.md', makePrompt('packs/default/links.md', 'C'.repeat(20))],
    ]);

    const matches = [
      { file: 'README.md', ruleSource: 'packs/default/ai-pattern.md' },
      { file: 'README.md', ruleSource: 'packs/default/consistency.md' },
      { file: 'docs/guide.md', ruleSource: 'packs/default/links.md' },
    ];

    const first = buildMatchedRuleUnits(matches, promptBySource, 400);
    const second = buildMatchedRuleUnits(matches, promptBySource, 400);

    expect(first).toEqual(second);
    expect(first).toEqual([
      {
        file: 'README.md',
        rules: [
          { ruleSource: 'packs/default/ai-pattern.md' },
          { ruleSource: 'packs/default/consistency.md' },
        ],
        estimatedTokens: expect.any(Number),
      },
      {
        file: 'docs/guide.md',
        rules: [{ ruleSource: 'packs/default/links.md' }],
        estimatedTokens: expect.any(Number),
      },
    ]);
  });

  it('splits matched rule units when the token budget boundary is hit', async () => {
    const { buildMatchedRuleUnits } = await import('../../src/agent/rule-units');

    const promptBySource = new Map<string, PromptFile>([
      ['packs/default/ai-pattern.md', makePrompt('packs/default/ai-pattern.md', 'A'.repeat(120))],
      ['packs/default/consistency.md', makePrompt('packs/default/consistency.md', 'B'.repeat(120))],
      ['packs/default/unsupported-claims.md', makePrompt('packs/default/unsupported-claims.md', 'C'.repeat(120))],
    ]);

    const units = buildMatchedRuleUnits(
      [
        { file: 'README.md', ruleSource: 'packs/default/ai-pattern.md' },
        { file: 'README.md', ruleSource: 'packs/default/consistency.md' },
        { file: 'README.md', ruleSource: 'packs/default/unsupported-claims.md' },
      ],
      promptBySource,
      120
    );

    expect(units).toEqual([
      {
        file: 'README.md',
        rules: [
          { ruleSource: 'packs/default/ai-pattern.md' },
          { ruleSource: 'packs/default/consistency.md' },
        ],
        estimatedTokens: expect.any(Number),
      },
      {
        file: 'README.md',
        rules: [{ ruleSource: 'packs/default/unsupported-claims.md' }],
        estimatedTokens: expect.any(Number),
      },
    ]);
  });
});
