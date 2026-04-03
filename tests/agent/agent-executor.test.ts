import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
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

function makePromptVariant(params: {
  fullPath: string;
  id: string;
  name: string;
  body: string;
  severity?: Severity;
}): PromptFile {
  return {
    id: params.id.toLowerCase(),
    filename: path.basename(params.fullPath),
    fullPath: params.fullPath,
    pack: 'Default',
    body: params.body,
    meta: {
      id: params.id,
      name: params.name,
      type: 'check',
      severity: params.severity ?? Severity.WARNING,
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
          findings: [
            {
              ruleSource: 'packs/default/consistency.md',
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
  const tempDirs: string[] = [];

  function createTempRepo(): string {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    tempDirs.push(repo);
    return repo;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes only read-only analysis tools plus finalize_review', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = (params.tools ?? {}) as Record<string, unknown>;
      const names = Object.keys(tools).sort();
      expect(names).toEqual([
        'agent',
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

  it('builds the agent loop prompt from matched rule units', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const systemPrompt = typeof params.systemPrompt === 'string' ? params.systemPrompt : '';

      expect(systemPrompt).toContain('Review files and Matched Rule Units:');
      expect(systemPrompt).toContain('- doc.md');
      expect(systemPrompt).toContain('  - Matched Rule Unit:');
      expect(systemPrompt).toContain('    - packs/default/consistency.md');
      expect(systemPrompt).toContain('    - packs/default/links.md');

      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [
        makePrompt(),
        makePromptVariant({
          fullPath: 'packs/default/links.md',
          id: 'Links',
          name: 'Links',
          body: 'Find broken links.',
        }),
      ],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
  });

  it('lets the main agent delegate bounded read-only work to a sub-agent', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const topLevelProvider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        const delegated = await tools.agent.execute({
          task: 'Summarize the document',
          model: 'high-cap',
        });
        expect(delegated).toEqual({
          ok: true,
          result: 'sub-agent summary',
          usage: { inputTokens: 2, outputTokens: 1 },
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    const subAgentProvider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop(params: Record<string, unknown>) {
        const toolNames = Object.keys((params.tools ?? {}) as Record<string, unknown>).sort();
        expect(toolNames).toEqual([
          'list_directory',
          'read_file',
          'search_content',
          'search_files',
        ]);
        return Promise.resolve({
          text: 'sub-agent summary',
          usage: { inputTokens: 2, outputTokens: 1 },
        });
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider: topLevelProvider,
      resolveCapabilityProvider: (requested) =>
        requested === 'high-cap' ? subAgentProvider : topLevelProvider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 2,
    });
  });

  it('uses the requested capability tier when delegating to a sub-agent', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const requestedModels: string[] = [];
    const topLevelProvider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      const delegated = await tools.agent.execute({
        task: 'Summarize the document',
        model: 'low-cap',
      });
      expect(delegated).toEqual({ ok: true, result: 'mid fallback summary' });
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const midFallbackProvider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop() {
        return Promise.resolve({ text: 'mid fallback summary' });
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider: topLevelProvider,
      resolveCapabilityProvider: (requested) => {
        requestedModels.push(requested);
        return midFallbackProvider;
      },
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(requestedModels).toContain('low-cap');
  });

  it('returns a compact sub-agent error without failing the main review loop', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const topLevelProvider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      const delegated = await tools.agent.execute({
        task: 'Summarize the document',
        model: 'high-cap',
      });
      expect(delegated).toEqual({ ok: false, error: 'sub-agent blew up' });
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });

    const failingSubAgentProvider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop() {
        return Promise.reject(new Error('sub-agent blew up'));
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider: topLevelProvider,
      resolveCapabilityProvider: () => failingSubAgentProvider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
  });

  it('uses the default provider when the agent tool omits model', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    let requestedTierCount = 0;
    const provider: LLMProvider = {
      runPromptStructured() {
        throw new Error('not used');
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        const toolNames = Object.keys(tools).sort();
        if (toolNames.includes('agent')) {
          const delegated = await tools.agent.execute({ task: 'Summarize the document' });
          expect(delegated).toEqual({ ok: true, result: 'default provider summary' });
          await tools.finalize_review.execute({});
          return { usage: { inputTokens: 1, outputTokens: 1 } };
        }

        expect(toolNames).toEqual([
          'list_directory',
          'read_file',
          'search_content',
          'search_files',
        ]);
        return { text: 'default provider summary' };
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [makePrompt()],
      provider,
      resolveCapabilityProvider: () => {
        requestedTierCount += 1;
        throw new Error('resolveCapabilityProvider should not be used without model');
      },
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(requestedTierCount).toBe(0);
  });

  it('merges multiple lint rules into one structured request and preserves rule severity', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    let structuredCalls = 0;
    const provider: LLMProvider = {
      runPromptStructured(_content, promptText: string) {
        structuredCalls += 1;
        expect(promptText).toContain('Rule 1');
        expect(promptText).toContain('Rule 2');
        return Promise.resolve({
          data: {
            reasoning: 'ok',
            findings: [
              {
                ruleSource: 'packs/default/consistency.md',
                line: 1,
                quoted_text: 'bad phrase',
                context_before: '',
                context_after: '',
                description: 'Consistency issue',
                analysis: 'Inconsistent wording.',
                message: 'Use consistent wording',
                suggestion: 'Replace the phrase',
                fix: 'better phrase',
                rule_quote: 'Keep wording consistent',
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
              {
                ruleSource: 'packs/default/accuracy.md',
                line: 1,
                quoted_text: 'bad phrase',
                context_before: '',
                context_after: '',
                description: 'Accuracy issue',
                analysis: 'This claim is unsupported.',
                message: 'Support the claim',
                suggestion: 'Add evidence',
                fix: 'supported phrase',
                rule_quote: 'Support technical claims',
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
                confidence: 0.91,
              },
            ],
          },
        });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          rules: [
            { ruleSource: 'packs/default/consistency.md' },
            { ruleSource: 'packs/default/accuracy.md' },
          ],
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [
        makePrompt(),
        makePromptVariant({
          fullPath: 'packs/default/accuracy.md',
          id: 'Accuracy',
          name: 'Accuracy',
          body: 'Support technical claims.',
          severity: Severity.ERROR,
        }),
      ],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(structuredCalls).toBe(1);
    expect(result.findings.map((finding) => finding.severity)).toEqual([
      Severity.WARNING,
      Severity.ERROR,
    ]);
  });

  it('returns explicit tool error for unknown ruleSource with valid-source hints', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      let errorMessage = '';
      try {
        await tools.lint.execute({
          file: 'doc.md',
          rules: [{ ruleSource: 'packs/default/does-not-exist.md' }],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AgentToolError);
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorMessage).toContain('Unknown ruleSource');
      expect(errorMessage).toContain('Valid sources');
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

  it('rejects merged lint findings that reference a rule outside the requested rules', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      let errorMessage = '';
      try {
        await tools.lint.execute({
          file: 'doc.md',
          rules: [{ ruleSource: 'packs/default/consistency.md' }],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AgentToolError);
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorMessage).toContain('Unknown ruleSource');
      expect(errorMessage).toContain('packs/default/consistency.md');
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 1, outputTokens: 1 } };
    });
    provider.runPromptStructured = () =>
      Promise.resolve({
        data: {
          reasoning: 'detected issue',
          findings: [
            {
              ruleSource: 'packs/default/accuracy.md',
              line: 1,
              quoted_text: 'bad phrase',
              context_before: '',
              context_after: '',
              description: 'Accuracy issue',
              analysis: 'This claim is unsupported.',
              message: 'Support the claim',
              suggestion: 'Add evidence',
              fix: 'supported phrase',
              rule_quote: 'Support technical claims',
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
              confidence: 0.91,
            },
          ],
        },
      });

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [
        makePrompt(),
        makePromptVariant({
          fullPath: 'packs/default/accuracy.md',
          id: 'Accuracy',
          name: 'Accuracy',
          body: 'Support technical claims.',
          severity: Severity.ERROR,
        }),
      ],
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

    const repo = createTempRepo();
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

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.lint.execute({
        file: 'doc.md',
        rules: [{ ruleSource: 'packs/default/consistency.md' }],
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

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({
          data: {
            reasoning: 'detected issue',
            findings: [],
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
          rules: [{ ruleSource: 'packs/default/consistency.md' }],
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

    const repo = createTempRepo();
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

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;

      await tools.lint.execute({
        file: 'doc.md',
        rules: [{ ruleSource: 'packs/default/consistency.md' }],
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

    const repo = createTempRepo();
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

      const repo = createTempRepo();
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

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    let toolError = '';

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;

      try {
        await tools.lint.execute({
          file: 'doc.md',
          rules: [{ ruleSource: 'packs/default/does-not-exist.md' }],
        });
      } catch (error) {
        toolError = error instanceof Error ? error.message : String(error);
      }

      await tools.lint.execute({
        file: 'doc.md',
        rules: [{ ruleSource: 'packs/default/consistency.md' }],
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

    const repo = createTempRepo();
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

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.lint.execute({
        file: 'doc.md',
        rules: [{ ruleSource: 'packs/default/consistency.md' }],
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

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const promptBodies: string[] = [];
    const provider: LLMProvider = {
      runPromptStructured(_content, promptText: string) {
        promptBodies.push(promptText);
        return Promise.resolve({ data: { reasoning: 'ok', findings: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          rules: [
            {
              ruleSource: 'packs/default/consistency.md',
              reviewInstruction: 'Review this file for wording consistency using the evidence you gathered.',
            },
          ],
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
    expect(promptBodies[0]).toContain('Rule 1');
    expect(promptBodies[0]).toContain('ruleSource: packs/default/consistency.md');
    expect(promptBodies[0]).toContain(
      'Review this file for wording consistency using the evidence you gathered.'
    );
    expect(promptBodies[0]).not.toContain('Find inconsistent wording.');
  });

  it('keeps lint prompt body unchanged when reviewInstruction is not provided', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const promptBodies: string[] = [];
    const provider: LLMProvider = {
      runPromptStructured(_content, promptText: string) {
        promptBodies.push(promptText);
        return Promise.resolve({ data: { reasoning: 'ok', findings: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          rules: [{ ruleSource: 'packs/default/consistency.md' }],
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
    expect(promptBodies[0]).toContain('Rule 1');
    expect(promptBodies[0]).toContain('ruleSource: packs/default/consistency.md');
    expect(promptBodies[0]).toContain('Find inconsistent wording.');
  });

  it('keeps reviewInstruction and context isolated per merged lint member', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const promptBodies: string[] = [];
    const provider: LLMProvider = {
      runPromptStructured(_content, promptText: string) {
        promptBodies.push(promptText);
        return Promise.resolve({ data: { reasoning: 'ok', findings: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          rules: [
            {
              ruleSource: 'packs/default/consistency.md',
              reviewInstruction: 'Use the gathered evidence for consistency.',
              context: 'Evidence from docs/glossary.md',
            },
            {
              ruleSource: 'packs/default/links.md',
            },
          ],
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    const result = await runAgentExecutor({
      targets: [path.join(repo, 'doc.md')],
      prompts: [
        makePrompt(),
        makePromptVariant({
          fullPath: 'packs/default/links.md',
          id: 'Links',
          name: 'Links',
          body: 'Check link targets.',
        }),
      ],
      provider,
      workspaceRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: repo,
    });

    expect(result.hadOperationalErrors).toBe(false);
    expect(promptBodies[0]).toContain('Rule 1');
    expect(promptBodies[0]).toContain('Use the gathered evidence for consistency.');
    expect(promptBodies[0]).toContain('Required context for this review:\nEvidence from docs/glossary.md');
    expect(promptBodies[0]).toContain('Rule 2');
    expect(promptBodies[0]).toContain('Check link targets.');
  });

  it('records judge-style violations as inline findings in agent mode', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
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
            reasoning: 'The wording is unclear.',
            findings: [
              {
                ruleSource: 'packs/default/consistency.md',
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
        });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          rules: [{ ruleSource: 'packs/default/consistency.md' }],
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

    const repo = createTempRepo();
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

  it('records started and failed events for visible-tool path errors', async () => {
    const { runAgentExecutor } = await import('../../src/agent/executor');

    const repo = createTempRepo();
    writeFileSync(path.join(repo, 'doc.md'), 'bad phrase\n', 'utf8');

    const provider = makeProvider(async (params) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await expect(tools.read_file.execute({ path: '../outside.md' })).rejects.toThrow();
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

    const started = result.events.find(
      (event: { eventType: string; payload?: { toolName?: string } }) =>
        event.eventType === SESSION_EVENT_TYPE.ToolCallStarted && event.payload?.toolName === 'read_file'
    );
    const failed = result.events.find(
      (event: { eventType: string; payload?: { toolName?: string; ok?: boolean; error?: string } }) =>
        event.eventType === SESSION_EVENT_TYPE.ToolCallFinished
        && event.payload?.toolName === 'read_file'
        && event.payload?.ok === false
    );

    expect(started).toBeDefined();
    expect(failed?.payload?.error).toContain('outside workspace root');
  });
});
