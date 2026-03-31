import { mkdtempSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../src/prompts/prompt-loader';
import type { LLMProvider } from '../../src/providers/llm-provider';
import { Severity } from '../../src/evaluators/types';
import { OutputFormat } from '../../src/cli/types';

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
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
  });

  it('returns explicit tool error for unknown ruleSource with valid-source hints', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.lint.execute({
        file: 'doc.md',
        ruleSource: 'packs/default/does-not-exist.md',
      });
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.errorMessage).toContain('Unknown ruleSource');
    expect(result.errorMessage).toContain('Valid sources');
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
      repositoryRoot: repo,
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
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    const inlineEventCount = result.events.filter(
      (event: { eventType: string }) => event.eventType === 'finding_recorded_inline'
    ).length;
    const topLevelEventCount = result.events.filter(
      (event: { eventType: string }) => event.eventType === 'finding_recorded_top_level'
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
    expect(result.events.some((event: { eventType: string }) => event.eventType === 'session_finalized')).toBe(true);
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
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    const eventTypes = result.events.map((event: { eventType: string }) => event.eventType);
    expect(eventTypes).toContain('session_started');
    expect(eventTypes).toContain('tool_call_started');
    expect(eventTypes).toContain('tool_call_finished');
    expect(eventTypes).toContain('finding_recorded_inline');
    expect(eventTypes).toContain('finding_recorded_top_level');
    expect(eventTypes).toContain('session_finalized');
    expect(eventTypes.indexOf('session_started')).toBeLessThan(eventTypes.indexOf('session_finalized'));
    expect(eventTypes.indexOf('finding_recorded_inline')).toBeLessThan(eventTypes.indexOf('session_finalized'));
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
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.errorMessage).toContain('finalize_review');
    const finalizedCount = result.events.filter(
      (event: { eventType: string }) => event.eventType === 'session_finalized'
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

      const provider = makeProvider(async (params) => {
        const tools = params.tools as Record<string, { execute: (payload: unknown) => Promise<unknown> }>;

        try {
          await tools[toolName]!.execute(input);
        } catch (error) {
          toolError = error instanceof Error ? error.message : String(error);
        }

        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      });

      const result = await runAgentExecutor({
        targets: [path.join(repo, 'doc.md')],
        prompts: [makePrompt()],
        provider,
        repositoryRoot: repo,
        scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
        outputFormat: OutputFormat.Json,
        printMode: true,
        sessionHomeDir: repo,
      });

      expect(result.hadOperationalErrors).toBe(false);
      expect(toolError).toBeTruthy();
      expect(toolError).toMatch(/outside|repository|root|bounds/i);
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
      repositoryRoot: repo,
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
          event.eventType === 'tool_call_finished' && event.payload?.ok === false
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
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
  });

  it('returns an operational error when the run ends without finalize_review', async () => {
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
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.errorMessage).toContain('finalize_review');
    expect(result.findings.length).toBe(0);
  });
});
