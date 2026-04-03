import { describe, expect, it } from 'vitest';
import { SESSION_EVENT_TYPE } from '../../src/agent/types';

describe('agent contracts', () => {
  it('accepts lint inputs with explicit rules, model, and agent task envelopes', async () => {
    const contracts = await import('../../src/agent/types');

    const lintInput = contracts.LINT_TOOL_INPUT_SCHEMA.parse({
      file: 'docs/guide.md',
      model: 'mid-cap',
      rules: [
        {
          ruleSource: 'packs/default/consistency.md',
          reviewInstruction: 'Review this file for consistency.',
          context: 'Focus on terminology.',
        },
      ],
    });
    expect(lintInput.rules).toHaveLength(1);
    expect(lintInput.rules[0]?.ruleSource).toBe('packs/default/consistency.md');
    expect(lintInput.model).toBe('mid-cap');

    const agentInput = contracts.AGENT_TOOL_INPUT_SCHEMA.parse({
      task: 'Summarize the open questions in this directory.',
      label: 'sub-agent pass',
      model: 'high-cap',
    });
    expect(agentInput.task).toContain('Summarize');
    expect(agentInput.model).toBe('high-cap');

    const topLevel = contracts.TOP_LEVEL_REPORT_INPUT_SCHEMA.parse({
      kind: 'top-level',
      ruleSource: 'packs/default/consistency.md',
      message: 'Cross-file inconsistency',
      references: [{ file: 'docs/guide.md', startLine: 2, endLine: 4 }],
    });
    expect(topLevel.kind).toBe('top-level');
    expect(topLevel.ruleSource).toBe('packs/default/consistency.md');
  });

  it('rejects blank lint rule instructions and context after trimming', async () => {
    const contracts = await import('../../src/agent/types');

    expect(() =>
      contracts.LINT_TOOL_INPUT_SCHEMA.parse({
        file: 'docs/guide.md',
        rules: [
          {
            ruleSource: 'packs/default/consistency.md',
            reviewInstruction: '   ',
          },
        ],
      })
    ).toThrow();

    expect(() =>
      contracts.LINT_TOOL_INPUT_SCHEMA.parse({
        file: 'docs/guide.md',
        rules: [
          {
            ruleSource: 'packs/default/consistency.md',
            context: '\t',
          },
        ],
      })
    ).toThrow();
  });

  it('accepts finalized session events with completion metadata', async () => {
    const contracts = await import('../../src/agent/types');

    const event = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:00.000Z',
      eventType: SESSION_EVENT_TYPE.SessionFinalized,
      payload: { totalFindings: 1, summary: 'done' },
    });

    expect(event.eventType).toBe(SESSION_EVENT_TYPE.SessionFinalized);
    expect(event.payload.totalFindings).toBe(1);
  });

  it('accepts required tool and finding session event variants for deterministic replay', async () => {
    const contracts = await import('../../src/agent/types');

    const started = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:00.000Z',
      eventType: SESSION_EVENT_TYPE.ToolCallStarted,
      payload: { toolName: 'lint', input: { file: 'docs/guide.md' } },
    });

    const finished = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:01.000Z',
      eventType: SESSION_EVENT_TYPE.ToolCallFinished,
      payload: { toolName: 'lint', ok: true },
    });

    const inlineFinding = contracts.SESSION_EVENT_SCHEMA.parse({
      sessionId: 'session-1',
      timestamp: '2026-03-31T00:00:02.000Z',
      eventType: SESSION_EVENT_TYPE.FindingRecordedInline,
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
      eventType: SESSION_EVENT_TYPE.FindingRecordedTopLevel,
      payload: {
        message: 'Cross-file mismatch',
        ruleSource: 'packs/default/consistency.md',
      },
    });

    expect(started.eventType).toBe(SESSION_EVENT_TYPE.ToolCallStarted);
    expect(finished.eventType).toBe(SESSION_EVENT_TYPE.ToolCallFinished);
    expect(inlineFinding.eventType).toBe(SESSION_EVENT_TYPE.FindingRecordedInline);
    expect(topLevelFinding.eventType).toBe(SESSION_EVENT_TYPE.FindingRecordedTopLevel);
  });
});
