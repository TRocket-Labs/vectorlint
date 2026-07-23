import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { reviewFiles } from '../src/cli/orchestrator';
import { OutputFormat, type ReviewOptions } from '../src/cli/types';
import { Severity } from '../src/review/severity';
import type { PromptFile } from '../src/prompts/prompt-loader';
import type { ReviewRequest, ReviewResult } from '../src/review/types';

const { EXECUTOR_FOR_MOCK, FAKE_EXECUTOR_RUN } = vi.hoisted(() => ({
  EXECUTOR_FOR_MOCK: vi.fn(),
  FAKE_EXECUTOR_RUN: vi.fn(),
}));

// Replace executorFor with a spy that returns a controllable executor so the
// orchestrator's wiring (ReviewRequest build -> chooseModelCall -> dispatch ->
// ReviewResult routing) is exercised without a real model call.
vi.mock('../src/executors', () => ({
  executorFor: EXECUTOR_FOR_MOCK,
}));

function makePrompt(id: string): PromptFile {
  return {
    id,
    filename: `${id}.md`,
    fullPath: path.join(process.cwd(), 'prompts', `${id}.md`),
    pack: 'TestPack',
    body: `Rule body for ${id}`,
    meta: { id, name: id, type: 'check', severity: Severity.WARNING },
  };
}

function makeOptions(prompts: PromptFile[], overrides: Partial<ReviewOptions> = {}): ReviewOptions {
  return {
    prompts,
    rulesPath: undefined,
    provider: {} as never,
    requestBuilder: {} as never,
    concurrency: 1,
    verbose: false,
    debugJson: false,
    scanPaths: [],
    outputFormat: OutputFormat.Json,
    modelCall: 'auto',
    ...overrides,
  };
}

function createTempFile(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vectorlint-dispatch-'));
  const filePath = path.join(dir, 'input.md');
  writeFileSync(filePath, content);
  return filePath;
}

function makeReviewResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    findings: [
      {
        ruleId: 'TestPack.CheckPrompt',
        ruleSource: path.join(process.cwd(), 'prompts', 'CheckPrompt.md'),
        severity: 'warning',
        message: 'Vague advice found',
        line: 1,
        column: 1,
        match: 'vague text',
        suggestion: 'Be specific.',
      },
    ],
    scores: [
      {
        ruleId: 'TestPack.CheckPrompt',
        score: 8,
        scoreText: '8.0/10',
        severity: 'warning',
        findingCount: 1,
      },
    ],
    diagnostics: [],
    hadOperationalErrors: false,
    usage: { modelCalls: 1, inputTokens: 10, outputTokens: 5 },
    ...overrides,
  };
}

describe('orchestrator executor dispatch', () => {
  beforeEach(() => {
    EXECUTOR_FOR_MOCK.mockReset();
    FAKE_EXECUTOR_RUN.mockReset();
    EXECUTOR_FOR_MOCK.mockReturnValue({ run: FAKE_EXECUTOR_RUN });
    FAKE_EXECUTOR_RUN.mockResolvedValue(makeReviewResult());
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves auto to single for a normal-sized target and routes findings to JSON output', async () => {
    const file = createTempFile('vague text here\n');
    const run = await reviewFiles([file], makeOptions([makePrompt('CheckPrompt')]));

    // auto + small target + one rule resolves to the single executor.
    expect(EXECUTOR_FOR_MOCK).toHaveBeenCalledTimes(1);
    expect(EXECUTOR_FOR_MOCK.mock.calls[0]![0]).toBe('single');

    // The verified finding reaches the JSON sink.
    const parsed = JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0])) as {
      files: Record<string, { issues: Array<Record<string, unknown>> }>;
    };
    const issues = Object.values(parsed.files).flatMap((f) => f.issues);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      line: 1,
      severity: Severity.WARNING,
      message: 'Vague advice found',
      rule: 'TestPack.CheckPrompt',
      match: 'vague text',
    });

    expect(run.totalWarnings).toBe(1);
    expect(run.totalErrors).toBe(0);
    expect(run.hadSeverityErrors).toBe(false);
    expect(run.hadOperationalErrors).toBe(false);
  });

  it('resolves auto to agent for a large target', async () => {
    const file = createTempFile(`${'x'.repeat(650_000)}\n`);
    await reviewFiles([file], makeOptions([makePrompt('BigPrompt')]));

    expect(EXECUTOR_FOR_MOCK).toHaveBeenCalledTimes(1);
    expect(EXECUTOR_FOR_MOCK.mock.calls[0]![0]).toBe('agent');
  });

  it('honors an explicit single modelCall even for a large target', async () => {
    const file = createTempFile(`${'x'.repeat(650_000)}\n`);
    await reviewFiles([file], makeOptions([makePrompt('ForcedSingle')], { modelCall: 'single' }));

    expect(EXECUTOR_FOR_MOCK.mock.calls[0]![0]).toBe('single');
  });

  it('honors an explicit agent modelCall even for a small target', async () => {
    const file = createTempFile('small\n');
    await reviewFiles([file], makeOptions([makePrompt('ForcedAgent')], { modelCall: 'agent' }));

    expect(EXECUTOR_FOR_MOCK.mock.calls[0]![0]).toBe('agent');
  });

  it('forwards the built ReviewRequest (target + rules + modelCall) to the executor', async () => {
    const file = createTempFile('target content line one\n');
    await reviewFiles([file], makeOptions([makePrompt('FwdPrompt')], { modelCall: 'agent' }));

    expect(FAKE_EXECUTOR_RUN).toHaveBeenCalledTimes(1);
    const request = FAKE_EXECUTOR_RUN.mock.calls[0]![0] as ReviewRequest;
    expect(request.target.content).toBe('target content line one\n');
    expect(request.rules).toHaveLength(1);
    expect(request.rules[0]?.body).toBe('Rule body for FwdPrompt');
    expect(request.modelCall).toBe('agent');
  });

  it('aggregates error-severity findings and flags hadSeverityErrors', async () => {
    FAKE_EXECUTOR_RUN.mockResolvedValue(
      makeReviewResult({
        findings: [
          {
            ruleId: 'TestPack.CheckPrompt',
            ruleSource: 'src',
            severity: 'error',
            message: 'Severe issue',
            line: 2,
            column: 1,
            match: 'vague text',
          },
        ],
        scores: [
          { ruleId: 'TestPack.CheckPrompt', score: 0, scoreText: '0.0/10', severity: 'error', findingCount: 1 },
        ],
      }),
    );
    const file = createTempFile('vague text\n');

    const run = await reviewFiles([file], makeOptions([makePrompt('ErrorPrompt')]));

    expect(run.totalErrors).toBe(1);
    expect(run.hadSeverityErrors).toBe(true);
  });

  it('routes ReviewResult diagnostics to verbose console output', async () => {
    FAKE_EXECUTOR_RUN.mockResolvedValue(
      makeReviewResult({
        findings: [],
        diagnostics: [{ level: 'warn', code: 'finding-evidence-not-locatable', message: 'could not anchor quote' }],
      }),
    );
    const file = createTempFile('vague text\n');

    await reviewFiles([file], makeOptions([makePrompt('DiagPrompt')], { verbose: true }));

    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
      expect.stringContaining('could not anchor quote'),
    );
  });

  it('aggregates token usage from the ReviewResult', async () => {
    const file = createTempFile('vague text\n');
    const run = await reviewFiles([file], makeOptions([makePrompt('UsagePrompt')]));

    expect(run.tokenUsage?.totalInputTokens).toBe(10);
    expect(run.tokenUsage?.totalOutputTokens).toBe(5);
  });

  it('skips the executor when no prompts apply', async () => {
    const file = createTempFile('content\n');
    // A scan-path config that runs a pack none of the prompts belong to.
    const run = await reviewFiles(
      [file],
      makeOptions([makePrompt('OrphanPrompt')], {
        scanPaths: [{ pattern: '**/*.md', runRules: ['OtherPack'], overrides: {} }],
      }),
    );

    expect(EXECUTOR_FOR_MOCK).not.toHaveBeenCalled();
    expect(run.totalFiles).toBe(1);
    expect(run.totalWarnings).toBe(0);
  });
});
