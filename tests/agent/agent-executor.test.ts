import { mkdtempSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../src/prompts/prompt-loader';
import type { LLMProvider } from '../../src/providers/llm-provider';
import { Severity } from '../../src/evaluators/types';
import { OutputFormat } from '../../src/cli/types';
import { SESSION_EVENT_TYPE } from '../../src/agent/types';
import { AgentToolError } from '../../src/errors';

function makePrompt(): PromptFile {
  return {
    id: 'consistency',
    filename: 'consistency.md',
    fullPath: 'packs/default/consistency.md',
    pack: 'Default',
    body: 'Find inconsistent wording.',
    meta: {
      id: 'Consistency',
      name: 'Consistency',
      type: 'check',
      severity: Severity.WARNING,
    },
  };
}

function makeProvider(
  script: (params: Record<string, unknown>) => Promise<{ usage?: { inputTokens: number; outputTokens: number } }>
): LLMProvider {
  return {
    runPromptStructured() {
      return Promise.resolve({
        data: {
          reasoning: 'detected issue',
          violations: [
            {
              line: 1,
              quoted_text: 'bad phrase',
              context_before: '',
              context_after: '',
              description: 'Bad phrase used',
              analysis: 'This wording is inconsistent.',
              message: 'Use consistent wording',
              suggestion: 'Replace bad phrase',
              fix: 'better phrase',
              rule_quote: 'Avoid vague wording',
              checks: {
                rule_supports_claim: true,
                evidence_exact: true,
                context_supports_violation: true,
                plausible_non_violation: false,
                fix_is_drop_in: true,
                fix_preserves_meaning: true,
              },
              check_notes: {
                rule_supports_claim: 'clear',
                evidence_exact: 'exact',
                context_supports_violation: 'yes',
                plausible_non_violation: 'none',
                fix_is_drop_in: 'yes',
                fix_preserves_meaning: 'yes',
              },
              confidence: 0.95,
            },
          ],
        },
      });
    },
    runAgentToolLoop: script as unknown as never,
  } as unknown as LLMProvider;
}

describe('agent executor', () => {
  it('exposes only non-mutating analysis tools plus finalize_review', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = (params.tools ?? {}) as Record<string, unknown>;
      const names = Object.keys(tools).sort();
      expect(names).toEqual([
        'finalize_review',
        'lint',
        'list_directory',
        'read_file',
        'report_finding',
        'search_content',
        'search_files',
      ]);

      const finalize = tools.finalize_review as { execute: (input: unknown) => Promise<unknown> };
      await finalize.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(result.fileRuleMatches).toEqual([
      { file: 'doc.md', ruleSource: 'packs/default/consistency.md' },
    ]);
  });

  it('returns explicit tool error for unknown ruleSource with valid-source hints', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await expect(
        tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/does-not-exist.md',
        })
      ).rejects.toBeInstanceOf(AgentToolError);
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
  });

  it('returns explicit tool error for unknown ruleSource in report_finding', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.report_finding.execute({
        kind: 'top-level',
        ruleSource: 'packs/default/does-not-exist.md',
        message: 'Unknown source',
      });
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.errorMessage).toContain('Unknown ruleSource');
    expect(result.errorMessage).toContain('Valid sources');
  });

  it('returns findings reconstructed from persisted inline and top-level session events', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.lint.execute({
        file: 'doc.md',
        ruleSource: 'packs/default/consistency.md',
      });
      await tools.report_finding.execute({
        kind: 'top-level',
        ruleSource: 'packs/default/consistency.md',
        message: 'Cross-file issue',
        references: [{ file: 'doc.md', startLine: 1, endLine: 1 }],
      });
      await tools.finalize_review.execute({ summary: 'done' });
      return { usage: { inputTokens: 10, outputTokens: 5 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    const inlineEventCount = result.events.filter(
      (event: { eventType: string }) => event.eventType === SESSION_EVENT_TYPE.FindingRecordedInline
    ).length;
    const topLevelEventCount = result.events.filter(
      (event: { eventType: string }) => event.eventType === SESSION_EVENT_TYPE.FindingRecordedTopLevel
    ).length;
    const replayableFindingEvents = inlineEventCount + topLevelEventCount;

    expect(replayableFindingEvents).toBeGreaterThanOrEqual(2);
    expect(result.findings.length).toBe(replayableFindingEvents);
    expect(result.findings.some((finding: { line: number }) => finding.line > 1)).toBe(false);
    expect(
      result.findings.some(
        (finding: { ruleId: string; ruleSource: string }) =>
          finding.ruleId === 'Default.Consistency' &&
          finding.ruleSource === 'packs/default/consistency.md'
      )
    ).toBe(true);
    expect(result.events.some((event: { eventType: string }) => event.eventType === SESSION_EVENT_TYPE.SessionFinalized)).toBe(true);
  });

  it('aggregates nested lint usage with agent loop usage', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({
          data: {
            reasoning: 'detected issue',
            violations: [],
          },
          usage: {
            inputTokens: 7,
            outputTokens: 3,
          },
        });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 11, outputTokens: 5 } };
      },
    };

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.usage).toEqual({
      inputTokens: 18,
      outputTokens: 8,
    });
  });

  it('falls back to matching all prompts when scanPaths is empty', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(result.fileRuleMatches).toEqual([
      { file: 'doc.md', ruleSource: 'packs/default/consistency.md' },
    ]);
  });

  it('records the required session event stream and preserves lifecycle ordering', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;

      await tools.lint.execute({
        file: 'doc.md',
        ruleSource: 'packs/default/consistency.md',
      });
      await tools.report_finding.execute({
        kind: 'top-level',
        ruleSource: 'packs/default/consistency.md',
        message: 'Cross-file issue',
      });
      await tools.finalize_review.execute({ summary: 'done' });

      return { usage: { inputTokens: 3, outputTokens: 2 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    const eventTypes = result.events.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toContain(SESSION_EVENT_TYPE.SessionStarted);
    expect(eventTypes).toContain(SESSION_EVENT_TYPE.ToolCallStarted);
    expect(eventTypes).toContain(SESSION_EVENT_TYPE.ToolCallFinished);
    expect(eventTypes).toContain(SESSION_EVENT_TYPE.FindingRecordedInline);
    expect(eventTypes).toContain(SESSION_EVENT_TYPE.FindingRecordedTopLevel);
    expect(eventTypes).toContain(SESSION_EVENT_TYPE.SessionFinalized);
    expect(eventTypes.indexOf(SESSION_EVENT_TYPE.SessionStarted)).toBeLessThan(
      eventTypes.indexOf(SESSION_EVENT_TYPE.SessionFinalized)
    );
    expect(eventTypes.indexOf(SESSION_EVENT_TYPE.FindingRecordedInline)).toBeLessThan(
      eventTypes.indexOf(SESSION_EVENT_TYPE.SessionFinalized)
    );
  });

  it('returns an operational error when finalize_review is called more than once', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;

      await tools.finalize_review.execute({ summary: 'first' });
      await tools.finalize_review.execute({ summary: 'second' });
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.errorMessage).toContain('finalize_review');
    const finalizedCount = result.events.filter(
      (event: { eventType: string }) => event.eventType === SESSION_EVENT_TYPE.SessionFinalized
    ).length;
    expect(finalizedCount).toBe(1);
  });

  it.each([
    {
      toolName: 'read_file',
      input: { path: '../outside.md' },
    },
    {
      toolName: 'search_files',
      input: { pattern: '../*.md' },
    },
    {
      toolName: 'list_directory',
      input: { path: '../' },
    },
    {
      toolName: 'search_content',
      input: { pattern: 'bad phrase', path: '../', glob: '**/*.md' },
    },
  ])(
    'returns explicit tool errors when $toolName is asked to access outside repository bounds',
    async ({ toolName, input }) => {
      const { runAgentExecutor } = await import('../../src/agent/executor');

      const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
      writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

      let toolError = '';
      let toolErrorValue: unknown;

      const provider = makeProvider(async (params) => {
        const tools = params.tools as Record<string, { execute: (payload: unknown) => Promise<unknown> }>;

        try {
          await tools[toolName]!.execute(input);
        } catch (error) {
          toolErrorValue = error;
          toolError = error instanceof Error ? error.message : String(error);
        }

        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      });

      const result = await runAgentExecutor({
        targets: [path.join(repo, 'doc.md')],
        prompts: [makePrompt()],
        provider,
        workspaceRoot: repo,
        scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
        outputFormat: OutputFormat.Json,
        printMode: true,
        sessionHomeDir: repo,
      });

      expect(result.hadOperationalErrors).toBe(false);
      expect(toolErrorValue).toBeInstanceOf(AgentToolError);
      expect(toolError).toBeTruthy();
      expect(toolError).toMatch(/outside|workspace|root|bounds/i);
    }
  );

  it('continues producing findings after a recoverable tool error and reports the tool diagnostic', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    let toolError = '';

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;

      try {
        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/does-not-exist.md',
        });
      } catch (error) {
        toolError = error instanceof Error ? error.message : String(error);
      }

      await tools.lint.execute({
        file: 'doc.md',
        ruleSource: 'packs/default/consistency.md',
      });
      await tools.finalize_review.execute({ summary: 'done' });

      return { usage: { inputTokens: 2, outputTokens: 2 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(toolError).toContain('Unknown ruleSource');
    expect(result.hadOperationalErrors).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(
      result.events.some(
        (event: { eventType: string; payload?: { ok?: boolean } }) =>
          event.eventType === SESSION_EVENT_TYPE.ToolCallFinished && event.payload?.ok === false
      )
    ).toBe(true);
  });

  it('allows read-only search_content tool usage without requiring mutation capabilities', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\nanother line\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      const output = await tools.search_content.execute({
        pattern: 'bad phrase',
        path: '.',
        glob: '**/*.md',
      });

      expect(output).toBeTruthy();
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
  });

  it('marks the run as operationally failed but preserves findings when finalize_review is missing', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.lint.execute({
        file: 'doc.md',
        ruleSource: 'packs/default/consistency.md',
      });
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.errorMessage).toContain('finalize_review');
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('uses reviewInstruction to override the prompt body for that lint invocation', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const promptBodies: string[] = [];
    const provider: LLMProvider = {
      runPromptStructured(_content, promptText: string) {
        promptBodies.push(promptText);
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
          reviewInstruction: 'Review this file for wording consistency using the evidence you gathered.',
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(promptBodies.length).toBeGreaterThan(0);
    expect(promptBodies[0]).toBe(
      'Review this file for wording consistency using the evidence you gathered.'
    );
  });

  it('keeps lint prompt body unchanged when reviewInstruction is not provided', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const promptBodies: string[] = [];
    const provider: LLMProvider = {
      runPromptStructured(_content, promptText: string) {
        promptBodies.push(promptText);
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(promptBodies.length).toBeGreaterThan(0);
    expect(promptBodies[0]).toBe('Find inconsistent wording.');
  });

  it('records judge-style violations as inline findings in agent mode', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const basePrompt = makePrompt();
    const judgePrompt: PromptFile = {
      ...basePrompt,
      body: 'Judge the document for clarity.',
      meta: {
        ...basePrompt.meta,
        type: 'judge',
        criteria: [{ id: 'Clarity', name: 'Clarity', weight: 1 }],
      },
    };

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({
          data: {
            criteria: [
              {
                name: 'Clarity',
                score: 2,
                summary: 'Needs work',
                reasoning: 'The wording is unclear.',
                violations: [
                  {
                    line: 1,
                    quoted_text: 'bad phrase',
                    context_before: '',
                    context_after: '',
                    description: 'Unclear wording',
                    analysis: 'This phrase is vague.',
                    message: 'Use clearer wording',
                    suggestion: 'Replace the vague phrase',
                    fix: 'better phrase',
                    rule_quote: 'Prefer precise language',
                    checks: {
                      rule_supports_claim: true,
                      evidence_exact: true,
                      context_supports_violation: true,
                      plausible_non_violation: false,
                      fix_is_drop_in: true,
                      fix_preserves_meaning: true,
                    },
                    check_notes: {
                      rule_supports_claim: 'clear',
                      evidence_exact: 'exact',
                      context_supports_violation: 'yes',
                      plausible_non_violation: 'none',
                      fix_is_drop_in: 'yes',
                      fix_preserves_meaning: 'yes',
                    },
                    confidence: 0.95,
                  },
                ],
              },
            ],
          },
        });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [judgePrompt],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'doc.md',
          ruleId: 'Default.Consistency',
          message: 'Use clearer wording',
        }),
      ])
    );
  });

  it('redacts raw read_file content from persisted tool_call_finished events', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'secret text\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.read_file.execute({ path: 'doc.md' });
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    const readFileEvent = result.events.find(
      (event: {
        eventType: string;
        payload?: { toolName?: string; output?: { path?: string; contentLength?: number } };
      }) => event.eventType === SESSION_EVENT_TYPE.ToolCallFinished && event.payload?.toolName === 'read_file'
    );

    expect(readFileEvent?.payload?.output).toEqual({
      path: 'doc.md',
      contentLength: 'secret text\n'.length,
    });
  });
});
