import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateFiles } from '../src/cli/orchestrator';
import { AGENT_REVIEW_MODE, OutputFormat } from '../src/cli/types';
import type { PromptFile } from '../src/prompts/prompt-loader';
import type { LLMProvider } from '../src/providers/llm-provider';
import { Severity } from '../src/evaluators/types';

function makePrompt(params?: {
  id?: string;
  name?: string;
  source?: string;
}): PromptFile {
  const id = params?.id ?? 'consistency';
  const name = params?.name ?? 'Consistency';
  const source = params?.source ?? 'packs/default/consistency.md';

  return {
    id,
    filename: `${id}.md`,
    fullPath: source,
    pack: 'Default',
    body: 'Find inconsistent wording',
    meta: {
      id: name,
      name,
      type: 'check',
      severity: Severity.WARNING,
    },
  };
}

function makeProvider(): LLMProvider {
  return {
    runPromptStructured() {
      return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
    },
    runAgentToolLoop: async (params: Record<string, unknown>) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.lint.execute({
        file: 'doc.md',
        ruleSource: 'packs/default/consistency.md',
      });
      await tools.report_finding.execute({
        kind: 'top-level',
        ruleSource: 'packs/default/consistency.md',
        message: 'Cross-file issue found',
        references: [{ file: 'doc.md', startLine: 1, endLine: 1 }],
      });
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 3, outputTokens: 2 } };
    },
  } as unknown as LLMProvider;
}

function makeTopLevelOnlyProvider(): LLMProvider {
  return {
    runPromptStructured() {
      return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
    },
    runAgentToolLoop: async (params: Record<string, unknown>) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.report_finding.execute({
        kind: 'top-level',
        ruleSource: 'packs/default/consistency.md',
        message: 'Top-level without references',
      });
      await tools.finalize_review.execute({});
      return { usage: { inputTokens: 2, outputTokens: 1 } };
    },
  } as unknown as LLMProvider;
}

function makeNoFinalizeProvider(): LLMProvider {
  return {
    runPromptStructured() {
      return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
    },
    runAgentToolLoop: async (params: Record<string, unknown>) => {
      const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      await tools.lint.execute({
        file: 'doc.md',
        ruleSource: 'packs/default/consistency.md',
      });
      await tools.report_finding.execute({
        kind: 'top-level',
        ruleSource: 'packs/default/consistency.md',
        message: 'Finding recorded before session ended',
        references: [{ file: 'doc.md', startLine: 1, endLine: 1 }],
      });
      // intentionally omit finalize_review to simulate missing-finalize scenario
      return { usage: { inputTokens: 3, outputTokens: 2 } };
    },
  } as unknown as LLMProvider;
}

describe('agent orchestrator output', () => {
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
  const tempRepos: string[] = [];

  function createTempRepo(): string {
    const repo = mkdtempSync(path.join(process.cwd(), 'tmp-agent-orch-'));
    tempRepos.push(repo);
    return repo;
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const repo of tempRepos.splice(0, tempRepos.length)) {
      rmSync(repo, { recursive: true, force: true });
    }
    if (originalIsTTY) {
      Object.defineProperty(process.stderr, 'isTTY', originalIsTTY);
    }
  });

  it('produces agent-mode findings and summary when mode is set to agent', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    expect(result.totalFiles).toBe(1);
    expect(result.totalWarnings).toBeGreaterThan(0);
    expect(result.hadOperationalErrors).toBe(false);
  });

  it('keeps json output shape consistent with formatter-based structure', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const payload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as {
      files?: Record<string, unknown>;
      summary?: { files?: number; errors?: number; warnings?: number };
      metadata?: { version?: string; timestamp?: string };
    };

    expect(payload.files).toBeDefined();
    expect(payload.summary).toBeDefined();
    expect(typeof payload.summary?.files).toBe('number');
    expect(typeof payload.summary?.errors).toBe('number');
    expect(typeof payload.summary?.warnings).toBe('number');
    expect(payload.metadata?.timestamp).toBeTruthy();
  });

  it('keeps top-level json keys consistent between standard and agent modes', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const standardPayload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as Record<string, unknown>;

    vi.mocked(console.log).mockClear();

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const agentPayload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as Record<string, unknown>;

    expect(Object.keys(agentPayload).sort()).toEqual(
      Object.keys(standardPayload).sort()
    );
  });

  it('emits configured agent progress messages in line output mode', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('◈ reviewing doc.md for Consistency');
    expect(stderrOutput).toContain('└ calling tool lint tool');
    expect(stderrOutput).toMatch(/[|/\-\\] ◈ reviewing doc\.md for Consistency/);
    expect(stderrOutput).not.toContain('[vectorlint]');
    expect(stderrOutput).toContain('◆ done in');
  });

  it('renders rich tool-call previews for lint and non-lint tools in agent line output', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;

        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await tools.search_files.execute({ pattern: '**/*.md' });
        await tools.read_file.execute({ path: 'doc.md' });
        await tools.finalize_review.execute({});

        return { usage: { inputTokens: 4, outputTokens: 2 } };
      },
    } as unknown as LLMProvider;

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('lint(');
    expect(stderrOutput).toContain('search_files(');
    expect(stderrOutput).toContain('read_file(');
  });

  it('renders interactive tool lines without a trailing newline', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 2, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const firstToolLine = stderrSpy.mock.calls
      .map((call) => String(call[0]))
      .find((chunk) => chunk.includes('calling tool'));

    expect(firstToolLine).toBeDefined();
    expect(firstToolLine?.endsWith('\n')).toBe(false);
  });

  it('uses in-place progress updates for repeated tool calls instead of appending only plain lines', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({ file: 'doc.md', ruleSource: 'packs/default/ai-pattern.md' });
        await tools.lint.execute({ file: 'doc.md', ruleSource: 'packs/default/consistency.md' });
        await tools.lint.execute({ file: 'doc.md', ruleSource: 'packs/default/wordiness.md' });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 3, outputTokens: 2 } };
      },
    } as unknown as LLMProvider;

    await evaluateFiles([file], {
      prompts: [
        makePrompt({ id: 'ai-pattern', name: 'AI Pattern', source: 'packs/default/ai-pattern.md' }),
        makePrompt({ id: 'consistency', name: 'Consistency', source: 'packs/default/consistency.md' }),
        makePrompt({ id: 'wordiness', name: 'Wordiness', source: 'packs/default/wordiness.md' }),
      ],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('\x1b[1A');
  });

  it('updates progress rule labels as the active lint rule changes', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({ file: 'doc.md', ruleSource: 'packs/default/ai-pattern.md' });
        await tools.lint.execute({ file: 'doc.md', ruleSource: 'packs/default/consistency.md' });
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 2, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    await evaluateFiles([file], {
      prompts: [
        makePrompt({ id: 'ai-pattern', name: 'AI Pattern', source: 'packs/default/ai-pattern.md' }),
        makePrompt({ id: 'consistency', name: 'Consistency', source: 'packs/default/consistency.md' }),
      ],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('for AI Pattern');
    expect(stderrOutput).toContain('for Consistency');
  });

  it('shows quality scores in agent line output and keeps operational failures explicit when finalize_review is missing', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
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
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.lint.execute({
          file: 'doc.md',
          ruleSource: 'packs/default/consistency.md',
        });
        return { usage: { inputTokens: 6, outputTokens: 3 } };
      },
    } as unknown as LLMProvider;

    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stdout = vi
      .mocked(console.log)
      .mock
      .calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.requestFailures).toBe(0);
    expect(stdout).toContain('Use consistent wording');
    expect(stdout).toContain('Quality Scores:');
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('suppresses progress output when print mode is enabled', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns machine-parseable json output without progress text contamination', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stdout = vi
      .mocked(console.log)
      .mock
      .calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(stdout).not.toContain('◈ reviewing');
    expect(stdout).not.toContain('└ calling tool');
    expect(stdout).not.toContain('◆ done');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('emits per-file progress transitions for multi-file agent runs', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const fileOne = path.join(repo, 'doc.md');
    const fileTwo = path.join(repo, 'doc2.md');
    writeFileSync(fileOne, 'bad phrase\n', 'utf8');
    writeFileSync(fileTwo, 'another bad phrase\n', 'utf8');

    await evaluateFiles([fileOne, fileTwo], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('◈ reviewing doc.md for Consistency');
    expect(stderrOutput).toContain('◆ done doc.md in');
    const firstFileDoneIndex = stderrOutput.indexOf('◆ done doc.md in');
    const secondFileStartIndex = stderrOutput.indexOf('◈ reviewing doc2.md for Consistency');
    expect(firstFileDoneIndex).toBeGreaterThan(-1);
    expect(secondFileStartIndex).toBeGreaterThan(firstFileDoneIndex);
    expect(stderrOutput).toContain('◆ done in');
  });

  it('renders top-level findings without explicit references at 1:1 in line output', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeTopLevelOnlyProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stdout = vi
      .mocked(console.log)
      .mock
      .calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(stdout).toContain('Top-level without references');
    expect(stdout).toContain('1:1');
  });

  it('keeps canonical rule identity and warning severity aligned across json and rdjson outputs', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const jsonPayload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as {
      files?: Record<string, { issues?: Array<{ rule: string; severity: string }> }>;
    };

    const jsonIssue =
      jsonPayload.files?.['doc.md']?.issues?.find(
        (issue) => issue.rule === 'Default.Consistency'
      ) ?? jsonPayload.files?.['doc.md']?.issues?.[0];

    vi.mocked(console.log).mockClear();

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.RdJson,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const rdjsonPayload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0])
    ) as {
      diagnostics?: Array<{ code?: { value?: string }; severity?: string }>;
    };

    const rdjsonDiagnostic =
      rdjsonPayload.diagnostics?.find(
        (diagnostic) => diagnostic.code?.value === 'Default.Consistency'
      ) ?? rdjsonPayload.diagnostics?.[0];

    expect(jsonIssue?.rule).toBe('Default.Consistency');
    expect(jsonIssue?.severity).toBe(Severity.WARNING);
    expect(rdjsonDiagnostic?.code?.value).toBe('Default.Consistency');
    expect(rdjsonDiagnostic?.severity).toBe(Severity.WARNING);
  });

  it('keeps rdjson output machine-parseable without interactive progress writes', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.RdJson,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stdout = vi.mocked(console.log).mock.calls.map((call) => String(call[0])).join('\n');
    expect(stdout).not.toContain('◈ reviewing');
    expect(stdout).not.toContain('└ calling tool');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('keeps vale-json output machine-parseable without interactive progress writes', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.ValeJson,
      mode: AGENT_REVIEW_MODE as never,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    const stdout = vi.mocked(console.log).mock.calls.map((call) => String(call[0])).join('\n');
    expect(stdout).not.toContain('◈ reviewing');
    expect(stdout).not.toContain('└ calling tool');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('surfaces findings recorded before missing finalize while still reporting an operational failure', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: makeNoFinalizeProvider(),
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    expect(result.totalWarnings).toBeGreaterThan(0);
    expect(result.requestFailures).toBe(0);
    expect(result.hadOperationalErrors).toBe(true);
  });

  it('passes userInstructionContent into the agent system prompt', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    let capturedSystemPrompt = '';
    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        const systemPrompt = params.systemPrompt;
        capturedSystemPrompt = typeof systemPrompt === 'string' ? systemPrompt : '';
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      userInstructionContent: 'Always enforce concise phrasing.',
    } as never);

    expect(capturedSystemPrompt).toContain('User Instructions (from VECTORLINT.md):');
    expect(capturedSystemPrompt).toContain('Always enforce concise phrasing.');
  });

  it('counts provider tool-loop failures as request failures in agent mode', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop() {
        return Promise.reject(new Error('provider request failed'));
      },
    } as unknown as LLMProvider;

    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.requestFailures).toBe(1);
  });

  it('passes a default agent retry budget to the provider tool loop', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    let receivedParams: Record<string, unknown> | undefined;
    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        receivedParams = params;
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    expect(receivedParams?.maxRetries).toBe(10);
  });

  it('passes configured agent retry budget to the provider tool loop', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    let receivedParams: Record<string, unknown> | undefined;
    const provider: LLMProvider = {
      runPromptStructured() {
        return Promise.resolve({ data: { reasoning: 'ok', violations: [] } });
      },
      runAgentToolLoop: async (params: Record<string, unknown>) => {
        receivedParams = params;
        const tools = params.tools as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
        await tools.finalize_review.execute({});
        return { usage: { inputTokens: 1, outputTokens: 1 } };
      },
    } as unknown as LLMProvider;

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE as never,
      printMode: true,
      agentMaxRetries: 4,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    } as never);

    expect(receivedParams?.maxRetries).toBe(4);
  });
});
