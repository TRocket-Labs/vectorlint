import { describe, expect, it } from 'vitest';

describe('agent contracts', () => {
  it('accepts ruleSource-based inputs for lint and top-level findings', async () => {
    const contracts = await import('../../src/agent/types');

    const lintInput = contracts.LINT_TOOL_INPUT_SCHEMA.parse({
      file: 'docs/guide.md',
      ruleSource: 'packs/default/consistency.md',
      context: 'optional context',
    });
    expect(lintInput.ruleSource).toBe('packs/default/consistency.md');

    const topLevel = contracts.TOP_LEVEL_REPORT_INPUT_SCHEMA.parse({
      kind: 'top-level',
      ruleSource: 'packs/default/consistency.md',
      message: 'Cross-file inconsistency',
      references: [{ file: 'docs/guide.md', startLine: 2, endLine: 4 }],
    });
    expect(topLevel.kind).toBe('top-level');
    expect(topLevel.ruleSource).toBe('packs/default/consistency.md');
  });

  it('accepts finalized session events with completion metadata', async () => {
    const contracts = await import('../../src/agent/types');

    const event = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:00.000Z',
      eventType: 'session_finalized',
      payload: { totalFindings: 1, summary: 'done' },
    });

    expect(event.eventType).toBe('session_finalized');
    expect(event.payload.totalFindings).toBe(1);
  });

  it('accepts required tool and finding session event variants for deterministic replay', async () => {
    const contracts = await import('../../src/agent/types');

    const started = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:00.000Z',
      eventType: 'tool_call_started',
      payload: { toolName: 'lint', input: { file: 'docs/guide.md' } },
    });

    const finished = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:01.000Z',
      eventType: 'tool_call_finished',
      payload: { toolName: 'lint', ok: true },
    });

    const inlineFinding = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:02.000Z',
      eventType: 'finding_recorded_inline',
      payload: {
        file: 'docs/guide.md',
        line: 2,
        message: 'Inconsistent term',
        ruleSource: 'packs/default/consistency.md',
      },
    });

    const topLevelFinding = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:03.000Z',
      eventType: 'finding_recorded_top_level',
      payload: {
        message: 'Cross-file mismatch',
        ruleSource: 'packs/default/consistency.md',
      },
    });

    expect(started.eventType).toBe('tool_call_started');
    expect(finished.eventType).toBe('tool_call_finished');
    expect(inlineFinding.eventType).toBe('finding_recorded_inline');
    expect(topLevelFinding.eventType).toBe('finding_recorded_top_level');
  });
});
