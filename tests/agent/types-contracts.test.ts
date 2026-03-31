import { describe, expect, it } from 'vitest';
import { TOP_LEVEL_REPORT_INPUT_SCHEMA, SESSION_EVENT_SCHEMA } from '../../src/agent/types';

describe('agent type contracts', () => {
  it('accepts tool input using ruleSource and normalizes canonical ruleId internally', () => {
    const input = {
      kind: 'top-level',
      ruleSource: 'packs/default/consistency.md',
      message: 'Cross-file inconsistency',
    };

    expect(TOP_LEVEL_REPORT_INPUT_SCHEMA.parse(input)).toBeTruthy();
  });

  it('defines session event union with finalize marker', () => {
    expect(
      SESSION_EVENT_SCHEMA.parse({
        sessionId: 'x',
        timestamp: '2026-03-31T00:00:00.000Z',
        eventType: 'session_finalized',
        payload: { totalFindings: 1 },
      })
    ).toBeTruthy();
  });
});
