import { describe, expect, it } from 'vitest';
import type { RuleFile } from '../../src/rules/rule-loader';

function makePrompt(ruleSource: string, body: string): RuleFile {
  const filename = ruleSource.split('/').pop() ?? 'rule.md';
  const basename = filename.replace(/\.md$/i, '');
  return {
    id: basename,
    filename,
    fullPath: ruleSource,
    pack: 'Default',
    content: body,
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

    const ruleBySource = new Map<string, RuleFile>([
      ['packs/default/ai-pattern.md', makePrompt('packs/default/ai-pattern.md', 'A'.repeat(40))],
      ['packs/default/consistency.md', makePrompt('packs/default/consistency.md', 'B'.repeat(40))],
      ['packs/default/links.md', makePrompt('packs/default/links.md', 'C'.repeat(20))],
    ]);

    const matches = [
      { file: 'README.md', ruleSource: 'packs/default/ai-pattern.md' },
      { file: 'README.md', ruleSource: 'packs/default/consistency.md' },
      { file: 'docs/guide.md', ruleSource: 'packs/default/links.md' },
    ];

    const first = buildMatchedRuleUnits(matches, ruleBySource, 400);
    const second = buildMatchedRuleUnits(matches, ruleBySource, 400);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({
      file: 'README.md',
      rules: [
        { ruleSource: 'packs/default/ai-pattern.md' },
        { ruleSource: 'packs/default/consistency.md' },
      ],
    });
    expect(first[1]).toMatchObject({
      file: 'docs/guide.md',
      rules: [{ ruleSource: 'packs/default/links.md' }],
    });
    expect(typeof first[0]?.estimatedTokens).toBe('number');
    expect(typeof first[1]?.estimatedTokens).toBe('number');
  });

  it('splits matched rule units when the token budget boundary is hit', async () => {
    const { buildMatchedRuleUnits } = await import('../../src/agent/rule-units');

    const ruleBySource = new Map<string, RuleFile>([
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
      ruleBySource,
      120
    );

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      file: 'README.md',
      rules: [
        { ruleSource: 'packs/default/ai-pattern.md' },
        { ruleSource: 'packs/default/consistency.md' },
      ],
    });
    expect(units[1]).toMatchObject({
      file: 'README.md',
      rules: [{ ruleSource: 'packs/default/unsupported-claims.md' }],
    });
    expect(typeof units[0]?.estimatedTokens).toBe('number');
    expect(typeof units[1]?.estimatedTokens).toBe('number');
  });
});
