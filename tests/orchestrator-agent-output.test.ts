import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateFiles } from '../src/cli/orchestrator';
import { AGENT_REVIEW_MODE, DEFAULT_REVIEW_MODE, OutputFormat } from '../src/cli/types';
import type { PromptFile } from '../src/prompts/prompt-loader';
import type { LLMProvider } from '../src/providers/llm-provider';
import type { Logger } from '../src/logging/logger';
import { Severity } from '../src/evaluators/types';

function makePrompt(): PromptFile {
  const id = 'consistency';
  const name = 'Consistency';
  return {
    id,
    filename: `${id}.md`,
    fullPath: 'packs/default/consistency.md',
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

type LoggerSpy = Logger & { warn: ReturnType<typeof vi.fn> };

function makeLogger(): LoggerSpy {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as LoggerSpy;
}

interface StandardProviderSpies {
  provider: LLMProvider;
  runPromptStructured: ReturnType<typeof vi.fn>;
  runAgentToolLoop: ReturnType<typeof vi.fn>;
}

function makeStandardProvider(): StandardProviderSpies {
  const runPromptStructured = vi.fn().mockResolvedValue({
    data: { reasoning: 'ok', violations: [] },
  });
  const runAgentToolLoop = vi.fn().mockResolvedValue({
    usage: { inputTokens: 0, outputTokens: 0 },
  });
  const provider = { runPromptStructured, runAgentToolLoop } as unknown as LLMProvider;
  return { provider, runPromptStructured, runAgentToolLoop };
}

// `--mode agent` is deprecated. These tests prove the CLI/evaluateFiles path no
// longer reaches the autonomous agent executor: it warns through the injected
// logger and falls back to standard evaluation. The retained agent executor
// code is covered directly by tests/agent/* and removed in Phase 4.
describe('agent mode deprecation', () => {
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
  });

  it('emits a deprecation warning through the injected logger and falls back to standard evaluation', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const { provider, runPromptStructured, runAgentToolLoop } = makeStandardProvider();
    const logger = makeLogger();

    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: AGENT_REVIEW_MODE,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('deprecated'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('docs/audits/2026-07-10-vectorlint-harness-architecture-audit.md'),
    );
    // Standard evaluation ran; the autonomous executor did not.
    expect(runAgentToolLoop).not.toHaveBeenCalled();
    expect(runPromptStructured).toHaveBeenCalled();
    expect(result.totalFiles).toBe(1);
  });

  it('does not invoke the agent executor in line output mode', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const { provider, runPromptStructured, runAgentToolLoop } = makeStandardProvider();
    const logger = makeLogger();

    await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Line,
      mode: AGENT_REVIEW_MODE,
      printMode: false,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
    expect(runAgentToolLoop).not.toHaveBeenCalled();
    expect(runPromptStructured).toHaveBeenCalled();
  });

  it('stays silent in standard mode without a logger', async () => {
    const repo = createTempRepo();
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const { provider, runAgentToolLoop } = makeStandardProvider();

    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: DEFAULT_REVIEW_MODE,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
    });

    // No deprecation warning and no executor invocation in standard mode.
    expect(runAgentToolLoop).not.toHaveBeenCalled();
    expect(result.totalFiles).toBe(1);
  });
});
