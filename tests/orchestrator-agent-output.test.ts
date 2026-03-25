import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('agent mode output formatting', () => {
  beforeEach(() => {
    RUN_AGENT_EXECUTOR_MOCK.mockReset();
    COLLECT_AGENT_FINDINGS_MOCK.mockReset();
    TOOL_EXECUTE_MOCK.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    RUN_AGENT_EXECUTOR_MOCK.mockResolvedValue({
      findings: [],
      ruleId: 'AgentRule',
    });
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

  it('runs agent per rule with scan-path matched files', async () => {
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
    const firstCallArgs = RUN_AGENT_EXECUTOR_MOCK.mock.calls[0]?.[0] as { rule: PromptFile; matchedFiles: string[] };
    expect(firstCallArgs.rule.meta.id).toBe('RuleA');
    expect(firstCallArgs.matchedFiles).toEqual(['docs/one.md']);
  });
});
