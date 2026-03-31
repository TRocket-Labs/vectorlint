import { describe, it, expect } from 'vitest';
import {
  TopLevelReportInputSchema,
  SessionEventSchema,
  canonicalRuleIdFromSource,
} from '../../src/agent';

describe('agent redesign contracts', () => {
  it('accepts tool input using ruleSource and normalizes canonical ruleId internally', () => {
    const input = {
      kind: 'top-level' as const,
      ruleSource: 'packs/default/consistency.md',
      message: 'Cross-file inconsistency',
    };

    expect(TopLevelReportInputSchema.parse(input)).toBeTruthy();
    expect(canonicalRuleIdFromSource(input.ruleSource)).toBe('Default.Consistency');
  });

  it('defines session event union with finalize marker', () => {
    expect(
      SessionEventSchema.parse({
        sessionId: 'x',
        timestamp: '2026-03-31T00:00:00.000Z',
        eventType: 'session_finalized',
        payload: { totalFindings: 1 },
      })
    ).toBeTruthy();
  });
});
