import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { PromptFile } from '../src/prompts/prompt-loader';
import { evaluateFiles } from '../src/cli/orchestrator';
import { AGENT_EVALUATION_MODE } from '../src/cli/mode';
import { OutputFormat, type EvaluationOptions } from '../src/cli/types';
import { Severity } from '../src/evaluators/types';

const {
  RUN_AGENT_EXECUTOR_MOCK,
  COLLECT_AGENT_FINDINGS_MOCK,
  TOOL_EXECUTE_MOCK,
} = vi.hoisted(() => ({
  RUN_AGENT_EXECUTOR_MOCK: vi.fn(),
  COLLECT_AGENT_FINDINGS_MOCK: vi.fn(),
  TOOL_EXECUTE_MOCK: vi.fn(),
}));

vi.mock('../src/agent/index', () => ({
  runAgentExecutor: RUN_AGENT_EXECUTOR_MOCK,
  collectAgentFindings: COLLECT_AGENT_FINDINGS_MOCK,
  createReadFileTool: vi.fn(() => ({ name: 'read_file', description: 'read', execute: TOOL_EXECUTE_MOCK })),
  createSearchContentTool: vi.fn(() => ({ name: 'search_content', description: 'search', execute: TOOL_EXECUTE_MOCK })),
  createSearchFilesTool: vi.fn(() => ({ name: 'search_files', description: 'files', execute: TOOL_EXECUTE_MOCK })),
  createListDirectoryTool: vi.fn(() => ({ name: 'list_directory', description: 'list', execute: TOOL_EXECUTE_MOCK })),
  createLintTool: vi.fn(() => ({ name: 'lint', description: 'lint', execute: TOOL_EXECUTE_MOCK })),
}));

function createPrompt(meta: PromptFile['meta']): PromptFile {
  return {
    id: meta.id,
    filename: `${meta.id}.md`,
    fullPath: `/rules/${meta.id}.md`,
    meta,
    body: 'Prompt body',
    pack: 'TestPack',
  };
}

function createBaseOptions(prompts: PromptFile[]): EvaluationOptions {
  return {
    mode: AGENT_EVALUATION_MODE,
    prompts,
    rulesPath: undefined,
    provider: {
      getLanguageModel: () => ({} as never),
    } as never,
    concurrency: 1,
    verbose: false,
    debugJson: false,
    scanPaths: [],
    outputFormat: OutputFormat.Line,
  };
}

const TMP = path.join(process.cwd(), 'tmp-orchestrator-agent-output-test');

describe('agent mode output formatting', () => {
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

  beforeEach(() => {
    RUN_AGENT_EXECUTOR_MOCK.mockReset();
    COLLECT_AGENT_FINDINGS_MOCK.mockReset();
    TOOL_EXECUTE_MOCK.mockReset();
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: false,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    RUN_AGENT_EXECUTOR_MOCK.mockResolvedValue({
      findings: [],
      ruleId: 'AgentRule',
    });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    vi.restoreAllMocks();
    if (originalIsTTY) {
      Object.defineProperty(process.stderr, 'isTTY', originalIsTTY);
    }
  });

  it('emits agent findings as rdjson diagnostics', async () => {
    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'judge',
      criteria: [{ id: 'Clarity', name: 'Clarity', weight: 1 }],
      severity: 'error',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([
      {
        kind: 'inline',
        file: 'docs/guide.md',
        startLine: 7,
        endLine: 7,
        message: 'Inline finding',
        ruleId: 'AgentRule',
      },
      {
        kind: 'top-level',
        message: 'Cross-document finding',
        ruleId: 'AgentRule',
        references: [{ file: 'docs/reference.md', startLine: 2 }],
      },
      {
        kind: 'top-level',
        message: 'Top-level without references',
        ruleId: 'AgentRule',
      },
    ]);

    const result = await evaluateFiles(['docs/changed.md'], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.RdJson,
    });

    const payload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0]),
    ) as { diagnostics: Array<{ message: string; severity: Severity; location: { path: string; range: { start: { line: number } } } }> };

    expect(payload.diagnostics).toHaveLength(3);
    expect(payload.diagnostics[0]?.location.path).toBe('docs/guide.md');
    expect(payload.diagnostics[0]?.location.range.start.line).toBe(7);
    expect(payload.diagnostics[0]?.severity).toBe(Severity.ERROR);
    expect(payload.diagnostics[1]?.location.path).toBe('docs/reference.md');
    expect(payload.diagnostics[1]?.severity).toBe(Severity.WARNING);
    expect(payload.diagnostics[2]?.location.path).toBe('docs/changed.md');
    expect(payload.diagnostics[2]?.severity).toBe(Severity.WARNING);
    expect(vi.mocked(console.warn).mock.calls.join('\n')).not.toContain('rdjson');
    expect(result.totalErrors).toBe(1);
    expect(result.totalWarnings).toBe(2);
    expect(result.hadSeverityErrors).toBe(true);
  });

  it('falls back to json payload for vale-json in agent mode', async () => {
    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([
      {
        kind: 'inline',
        file: 'docs/guide.md',
        startLine: 3,
        endLine: 3,
        message: 'Inline finding',
        ruleId: 'AgentRule',
      },
    ]);

    const result = await evaluateFiles(['docs/changed.md'], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.ValeJson,
    });

    expect(vi.mocked(console.warn).mock.calls.join('\n')).toContain('vale-json is not supported in agent mode');
    const payload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0]),
    ) as { metadata: { mode: string }; summary: { errors: number; warnings: number } };
    expect(payload.metadata.mode).toBe(AGENT_EVALUATION_MODE);
    expect(payload.summary.errors).toBe(0);
    expect(payload.summary.warnings).toBe(1);
    expect(result.totalErrors).toBe(0);
    expect(result.totalWarnings).toBe(1);
    expect(result.hadSeverityErrors).toBe(false);
  });

  it('does not leak progress text to stdout for json-family outputs', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await evaluateFiles(['docs/changed.md'], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.Json,
    });

    const stdout = vi
      .mocked(console.log)
      .mock
      .calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(stdout).not.toContain('[vectorlint] analyzing...');
    expect(stdout).not.toContain('◆ reviewing.....');
    expect(stdout).not.toContain('◆ done');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('shows block progress text in line mode and ends with run completion', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await evaluateFiles(['docs/changed.md'], createBaseOptions([prompt]));

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('◈ reviewing docs/changed.md for Agent Rule');
    expect(stderrOutput).toContain('└ calling tool lint tool');
    expect(stderrOutput).toContain('◆ done in');
    expect(stderrOutput).toContain('\n');
  });

  it('emits no progress output in line mode when stderr is not a TTY', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: false,
    });

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await evaluateFiles(['docs/changed.md'], createBaseOptions([prompt]));

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses agent interactive progress output when print mode is enabled', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);
    await evaluateFiles(['docs/changed.md'], {
      ...createBaseOptions([prompt]),
      print: true,
    });

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('renders agent findings with lint-style issue rows and top-level defaults to 1:1', async () => {
    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([
      {
        kind: 'inline',
        file: 'docs/guide.md',
        startLine: 7,
        endLine: 7,
        message: 'Inline finding',
        ruleId: 'AgentRule',
        suggestion: 'Fix inline',
      },
      {
        kind: 'top-level',
        message: 'Top-level finding',
        ruleId: 'AgentRule',
        suggestion: 'Fix top-level',
      },
    ]);

    await evaluateFiles(['docs/changed.md'], createBaseOptions([prompt]));

    const stdout = vi
      .mocked(console.log)
      .mock
      .calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(stdout).toContain('Inline finding');
    expect(stdout).toContain('Top-level finding');
    expect(stdout).toContain('7:1');
    expect(stdout).toContain('1:1');
    expect(stdout).toContain('suggestion:');
    expect(stdout).not.toContain('[agent:warning]');
  });

  it('computes deterministic scores from inline findings only (top-level excluded)', async () => {
    mkdirSync(path.join(TMP, 'docs'), { recursive: true });
    const fiveHundredWords = Array.from({ length: 500 }, (_, index) => `w${index}`).join(' ');
    writeFileSync(path.join(TMP, 'docs', 'guide.md'), fiveHundredWords);

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'error',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([
      {
        kind: 'inline',
        file: path.join(TMP, 'docs', 'guide.md'),
        startLine: 1,
        endLine: 1,
        message: 'Inline finding',
        ruleId: 'AgentRule',
      },
      {
        kind: 'top-level',
        message: 'Off-page finding',
        ruleId: 'AgentRule',
      },
    ]);

    await evaluateFiles([path.join(TMP, 'docs', 'guide.md')], {
      ...createBaseOptions([prompt]),
      outputFormat: OutputFormat.Json,
    });

    const payload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0]),
    ) as { scores: Array<{ ruleId: string; score: number }> };

    expect(payload.scores).toHaveLength(1);
    expect(payload.scores[0]?.ruleId).toBe('AgentRule');
    // 1 inline finding over 500 words with strictness=10 => score 9.8
    expect(payload.scores[0]?.score).toBe(9.8);
  });

  it('calls the agent executor once with a run-level fileRuleMap under scan-path filtering', async () => {
    const promptA = createPrompt({
      id: 'RuleA',
      name: 'Rule A',
      type: 'check',
      severity: 'error',
    });
    const promptB = createPrompt({
      id: 'RuleB',
      name: 'Rule B',
      type: 'check',
      severity: 'error',
    });
    promptA.pack = 'PackA';
    promptB.pack = 'PackB';

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/one.md', 'guides/two.md'], {
      ...createBaseOptions([promptA, promptB]),
      scanPaths: [
        {
          pattern: 'docs/**/*.md',
          runRules: ['PackA'],
          overrides: {},
        },
      ],
    });

    expect(RUN_AGENT_EXECUTOR_MOCK).toHaveBeenCalledTimes(1);
    const firstCallArgs = RUN_AGENT_EXECUTOR_MOCK.mock.calls[0]?.[0] as {
      requestedTargets: string[];
      fileRuleMap: Array<{ file: string; rules: PromptFile[] }>;
    };
    expect(firstCallArgs.requestedTargets).toEqual(['docs/one.md', 'guides/two.md']);
    expect(firstCallArgs.fileRuleMap).toEqual([
      { file: 'docs/one.md', rules: [promptA] },
    ]);
    expect(firstCallArgs.maxParallelToolCalls).toBe(1);
    expect(firstCallArgs.maxRetries).toBeUndefined();
  });

  it('builds the run-level fileRuleMap with scan-path overrides', async () => {
    const promptA = createPrompt({
      id: 'RuleA',
      name: 'Rule A',
      type: 'check',
      severity: 'error',
    });
    const promptB = createPrompt({
      id: 'RuleB',
      name: 'Rule B',
      type: 'check',
      severity: 'error',
    });
    promptA.pack = 'PackA';
    promptB.pack = 'PackB';

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/a.md', 'guides/b.md'], {
      ...createBaseOptions([promptA, promptB]),
      scanPaths: [
        {
          pattern: '**/*.md',
          runRules: ['PackA', 'PackB'],
          overrides: {},
        },
        {
          pattern: 'docs/**/*.md',
          overrides: {
            'PackA.RuleA': 'disabled',
          },
        },
      ],
    });

    expect(RUN_AGENT_EXECUTOR_MOCK).toHaveBeenCalledTimes(1);

    const calls = RUN_AGENT_EXECUTOR_MOCK.mock.calls.map((call) => {
      const arg = call[0] as {
        requestedTargets: string[];
        fileRuleMap: Array<{ file: string; rules: PromptFile[] }>;
      };
      return { requestedTargets: arg.requestedTargets, fileRuleMap: arg.fileRuleMap };
    });

    expect(calls).toEqual([
      {
        requestedTargets: ['docs/a.md', 'guides/b.md'],
        fileRuleMap: [
          { file: 'docs/a.md', rules: [promptB] },
          { file: 'guides/b.md', rules: [promptA, promptB] },
        ],
      },
    ]);
  });

  it('forces serial rule execution in agent mode even with higher concurrency', async () => {
    const promptA = createPrompt({
      id: 'RuleA',
      name: 'Rule A',
      type: 'check',
      severity: 'error',
    });
    const promptB = createPrompt({
      id: 'RuleB',
      name: 'Rule B',
      type: 'check',
      severity: 'error',
    });

    let activeRuns = 0;
    let maxActiveRuns = 0;
    RUN_AGENT_EXECUTOR_MOCK.mockImplementation(async (args: {
      fileRuleMap: Array<{ file: string; rules: PromptFile[] }>;
    }) => {
      activeRuns += 1;
      maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRuns -= 1;
      return {
        findings: [],
        ruleId: args.fileRuleMap[0]?.rules[0]?.meta.id ?? 'RuleA',
      };
    });
    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/one.md'], {
      ...createBaseOptions([promptA, promptB]),
      concurrency: 4,
    });

    expect(maxActiveRuns).toBe(1);
  });

  it('passes configured agent max retries through to executor', async () => {
    const prompt = createPrompt({
      id: 'RuleA',
      name: 'Rule A',
      type: 'check',
      severity: 'error',
    });
    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/one.md'], {
      ...createBaseOptions([prompt]),
      agentMaxRetries: 9,
    });

    const firstCallArgs = RUN_AGENT_EXECUTOR_MOCK.mock.calls[0]?.[0] as { maxRetries?: number };
    expect(firstCallArgs.maxRetries).toBe(9);
  });

  it('surfaces tool-level status updates in line mode', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    RUN_AGENT_EXECUTOR_MOCK.mockImplementation((args: {
      fileRuleMap: Array<{ file: string; rules: PromptFile[] }>;
      onStatus?: (event: { type: string; stepNumber: number; toolName?: string; toolArgs?: unknown }) => void;
    }) => {
      args.onStatus?.({ type: 'step-start', stepNumber: 0 });
      args.onStatus?.({
        type: 'tool-start',
        stepNumber: 0,
        toolName: 'search_files',
        toolArgs: { pattern: '**/*.md', path: 'docs' },
      });
      args.onStatus?.({
        type: 'tool-finish',
        stepNumber: 0,
        toolName: 'search_files',
        toolArgs: { pattern: '**/*.md', path: 'docs' },
      });
      return {
        findings: [],
        ruleId: args.fileRuleMap[0]?.rules[0]?.meta.id ?? 'AgentRule',
      };
    });
    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/changed.md'], createBaseOptions([prompt]));

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('calling tool search_files tool');
    expect(stderrOutput).toContain('search_files(pattern:"**/*.md", path:"docs")');
    expect(stderrOutput).toContain('◆ done in');
  });

  it('renders lint tool line as concise rule preview (no file/ruleContent args)', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    RUN_AGENT_EXECUTOR_MOCK.mockImplementation((args: {
      fileRuleMap: Array<{ file: string; rules: PromptFile[] }>;
      onStatus?: (event: { type: string; stepNumber: number; toolName?: string; toolArgs?: unknown }) => void;
    }) => {
      args.onStatus?.({
        type: 'tool-start',
        stepNumber: 0,
        toolName: 'lint',
        toolArgs: { file: 'README.md', ruleContent: 'Very long rule text that should not be printed as args' },
      });
      return {
        findings: [],
        ruleId: args.fileRuleMap[0]?.rules[0]?.meta.id ?? 'AgentRule',
      };
    });
    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['README.md'], createBaseOptions([prompt]));

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('└ calling tool lint tool lint(...)');
    expect(stderrOutput).not.toContain('ruleContent:');
    expect(stderrOutput).not.toContain('file:"README.md"');
  });

  it('keeps one progress block per file while switching rules within the file', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const promptA = createPrompt({
      id: 'RuleA',
      name: 'Rule A',
      type: 'check',
      severity: 'warning',
    });
    const promptB = createPrompt({
      id: 'RuleB',
      name: 'Rule B',
      type: 'check',
      severity: 'warning',
    });
    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/one.md'], createBaseOptions([promptA, promptB]));

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('reviewing docs/one.md for Rule A');
    expect(stderrOutput).toContain('reviewing docs/one.md for Rule B');
    const doneCount = (stderrOutput.match(/◆ done docs\/one\.md in/g) || []).length;
    expect(doneCount).toBe(1);
  });

  it('appends a new progress block when moving to the next file', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const prompt = createPrompt({
      id: 'AgentRule',
      name: 'Agent Rule',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/one.md', 'docs/two.md'], createBaseOptions([prompt]));

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('reviewing docs/one.md for Agent Rule');
    expect(stderrOutput).toContain('reviewing docs/two.md for Agent Rule');
    expect(stderrOutput).toMatch(/\n[|/\-\\] ◈ reviewing docs\/two\.md for Agent Rule/);
  });

  it('documents current behavior: no prompts + user instructions does not execute agent runs', async () => {
    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['docs/changed.md'], {
      ...createBaseOptions([]),
      userInstructionContent: 'Review docs for factual correctness against the codebase.',
    });

    expect(RUN_AGENT_EXECUTOR_MOCK).not.toHaveBeenCalled();
    const stdout = vi
      .mocked(console.log)
      .mock
      .calls
      .map((call) => String(call[0]))
      .join('\n');
    expect(stdout).toContain('[vectorlint] No agent findings.');
  });

  it('renders non-lint tool activity for top-level style checks in progress output', async () => {
    Object.defineProperty(process.stderr, 'isTTY', {
      configurable: true,
      value: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const prompt = createPrompt({
      id: 'TopLevelReview',
      name: 'Top Level Review',
      type: 'check',
      severity: 'warning',
    });

    RUN_AGENT_EXECUTOR_MOCK.mockImplementation((args: {
      fileRuleMap: Array<{ file: string; rules: PromptFile[] }>;
      onStatus?: (event: { type: string; stepNumber: number; toolName?: string; toolArgs?: unknown }) => void;
    }) => {
      args.onStatus?.({
        type: 'tool-start',
        stepNumber: 0,
        toolName: 'list_directory',
        toolArgs: { path: 'src' },
      });
      args.onStatus?.({
        type: 'tool-start',
        stepNumber: 1,
        toolName: 'read_file',
        toolArgs: { path: 'README.md' },
      });
      return {
        findings: [],
        ruleId: args.fileRuleMap[0]?.rules[0]?.meta.id ?? 'TopLevelReview',
      };
    });
    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([]);

    await evaluateFiles(['README.md'], createBaseOptions([prompt]));

    const stderrOutput = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(stderrOutput).toContain('calling tool list_directory tool');
    expect(stderrOutput).toContain('list_directory(path:"src")');
    expect(stderrOutput).toContain('calling tool read_file tool');
    expect(stderrOutput).toContain('read_file("README.md")');
  });

  it('renders top-level findings with references in line output using 1:1 fallback location', async () => {
    const prompt = createPrompt({
      id: 'TopLevelReview',
      name: 'Top Level Review',
      type: 'check',
      severity: 'warning',
    });

    COLLECT_AGENT_FINDINGS_MOCK.mockReturnValue([
      {
        kind: 'top-level',
        message: 'README mentions feature X but implementation is missing.',
        ruleId: 'TopLevelReview',
        references: [{ file: 'README.md', startLine: 12, endLine: 12 }],
      },
    ]);

    await evaluateFiles(['README.md'], createBaseOptions([prompt]));

    const stdout = vi
      .mocked(console.log)
      .mock
      .calls
      .map((call) => String(call[0]))
      .join('\n');

    expect(stdout).toContain('README.md');
    expect(stdout).toContain('1:1');
    expect(stdout).toContain('README mentions feature X but implementation is missing.');
  });
});
