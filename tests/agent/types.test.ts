import { describe, it, expect } from 'vitest';
import {
  InlineFindingSchema,
  TopLevelFindingSchema,
  AgentFindingSchema,
} from '../../src/agent/types';

describe('InlineFindingSchema', () => {
  it('accepts valid inline finding', () => {
    const result = InlineFindingSchema.safeParse({
      kind: 'inline',
      file: 'docs/quickstart.md',
      startLine: 10,
      endLine: 12,
      message: 'Passive voice detected',
      ruleId: 'PassiveVoice',
    });

    expect(result.success).toBe(true);
  });

  it('rejects inline finding missing file', () => {
    const result = InlineFindingSchema.safeParse({
      kind: 'inline',
      startLine: 10,
      endLine: 12,
      message: 'test',
      ruleId: 'Test',
    });

    expect(result.success).toBe(false);
  });
});

describe('TopLevelFindingSchema', () => {
  it('accepts finding with references', () => {
    const result = TopLevelFindingSchema.safeParse({
      kind: 'top-level',
      message: 'Terminology drift detected',
      ruleId: 'Consistency',
      references: [
        { file: 'docs/a.md', startLine: 5 },
        { file: 'docs/b.md' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts structural finding with no references', () => {
    const result = TopLevelFindingSchema.safeParse({
      kind: 'top-level',
      message: 'llms.txt is missing',
      ruleId: 'LlmsTxt',
    });

    expect(result.success).toBe(true);
  });
});

describe('AgentFindingSchema', () => {
  it('discriminates by kind field', () => {
    const inline = AgentFindingSchema.safeParse({
      kind: 'inline',
      file: 'x.md',
      startLine: 1,
      endLine: 2,
      message: 'test',
      ruleId: 'R',
    });
    expect(inline.success).toBe(true);

    const topLevel = AgentFindingSchema.safeParse({
      kind: 'top-level',
      message: 'test',
      ruleId: 'R',
    });
    expect(topLevel.success).toBe(true);

    const invalid = AgentFindingSchema.safeParse({ kind: 'unknown' });
    expect(invalid.success).toBe(false);
  });
});
