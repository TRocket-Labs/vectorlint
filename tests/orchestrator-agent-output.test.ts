import { afterEach, describe, it, expect, vi } from 'vitest';
import path from 'path';
import { evaluateFiles } from '../src/cli/orchestrator';
import { OutputFormat } from '../src/cli/types';
import type { PromptFile } from '../src/prompts/prompt-loader';

function createPrompt(): PromptFile {
  return {
    id: 'consistency',
    filename: 'consistency.md',
    fullPath: path.join(process.cwd(), 'packs', 'default', 'consistency.md'),
    meta: {
      id: 'Consistency',
      name: 'Consistency',
      type: 'check',
    },
    body: 'Flag terminology drift',
    pack: 'Default',
  };
}

const README_PATH = path.join(process.cwd(), 'README.md');

function withTTY(enabled: boolean): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
  Object.defineProperty(process.stderr, 'isTTY', {
    configurable: true,
    value: enabled,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(process.stderr, 'isTTY', descriptor);
      return;
    }
    delete (process.stderr as { isTTY?: boolean }).isTTY;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('orchestrator agent mode output', () => {
  it('returns non-zero evaluation when agent finalize is missing', async () => {
    const evalResult = await evaluateFiles([README_PATH], {
      prompts: [createPrompt()],
      rulesPath: undefined,
      provider: {} as never,
      concurrency: 1,
      verbose: false,
      debugJson: false,
      scanPaths: [],
      outputFormat: OutputFormat.Line,
      mode: 'agent',
      print: false,
      agent: {
        execute: async ({ lint }: { lint: (input: unknown) => Promise<unknown> }) => {
          await lint({
            file: README_PATH,
            ruleSource: 'packs/default/consistency.md',
          });
        },
      },
    });

    expect(evalResult.hadOperationalErrors).toBe(true);
  });

  it('derives final findings from session replay, not free-form model text', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await evaluateFiles([README_PATH], {
      prompts: [createPrompt()],
      rulesPath: undefined,
      provider: {} as never,
      concurrency: 1,
      verbose: false,
      debugJson: false,
      scanPaths: [],
      outputFormat: OutputFormat.Json,
      mode: 'agent',
      print: false,
      agent: {
        runRule: () => Promise.resolve({
          violations: [{ line: 2, message: 'Term mismatch' }],
        }),
        execute: async ({
          lint,
          finalize_review,
        }: {
          lint: (input: unknown) => Promise<unknown>;
          finalize_review: (input?: { totalFindings?: number }) => Promise<void>;
        }) => {
          await lint({
            file: README_PATH,
            ruleSource: 'packs/default/consistency.md',
          });
          await finalize_review({ totalFindings: 1 });
        },
      },
    });

    const payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '{}')) as {
      findings: Array<{ ruleId: string }>;
    };
    expect(payload.findings[0]?.ruleId).toBe('Default.Consistency');
    logSpy.mockRestore();
  });

  it('prevents score/severity key mismatch by canonical Pack.Rule replay mapping', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await evaluateFiles([README_PATH], {
      prompts: [createPrompt()],
      rulesPath: undefined,
      provider: {} as never,
      concurrency: 1,
      verbose: false,
      debugJson: false,
      scanPaths: [],
      outputFormat: OutputFormat.Json,
      mode: 'agent',
      print: false,
      agent: {
        runRule: () => Promise.resolve({
          violations: [{ line: 2, message: 'Term mismatch' }],
        }),
        execute: async ({
          lint,
          finalize_review,
        }: {
          lint: (input: unknown) => Promise<unknown>;
          finalize_review: (input?: { totalFindings?: number }) => Promise<void>;
        }) => {
          await lint({
            file: README_PATH,
            ruleSource: 'packs/default/consistency.md',
          });
          await finalize_review({ totalFindings: 1 });
        },
      },
    });

    const payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '{}')) as {
      summary: { errors: number };
      scores: Array<{ ruleId: string }>;
    };
    expect(payload.summary.errors).toBe(1);
    expect(payload.scores[0]?.ruleId).toBe('Default.Consistency');
    logSpy.mockRestore();
  });

  it('suppresses agent progress in print mode', async () => {
    const restoreTTY = withTTY(true);
    let stderrOutput = '';
    const writeSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(((chunk: unknown) => {
        stderrOutput += String(chunk);
        return true;
      }) as never);

    await evaluateFiles([README_PATH], {
      prompts: [createPrompt()],
      rulesPath: undefined,
      provider: {} as never,
      concurrency: 1,
      verbose: false,
      debugJson: false,
      scanPaths: [],
      outputFormat: OutputFormat.Line,
      mode: 'agent',
      print: true,
    });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(stderrOutput).toBe('');
    restoreTTY();
  });

  it('keeps stdout machine-safe in json/rdjson/vale-json', async () => {
    const restoreTTY = withTTY(true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const formats = [OutputFormat.Json, OutputFormat.RdJson, OutputFormat.ValeJson];
    for (const format of formats) {
      await evaluateFiles([README_PATH], {
        prompts: [createPrompt()],
        rulesPath: undefined,
        provider: {} as never,
        concurrency: 1,
        verbose: false,
        debugJson: false,
        scanPaths: [],
        outputFormat: format,
        mode: 'agent',
        print: false,
      });

      const payload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? '{}')) as {
        summary: { totalFindings: number };
      };
      expect(payload.summary.totalFindings).toBeTypeOf('number');
    }

    expect(stderrSpy).not.toHaveBeenCalled();
    restoreTTY();
  });

  it('renders exact progress context and tool lines in interactive line mode', async () => {
    const restoreTTY = withTTY(true);
    let stderrOutput = '';
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      stderrOutput += String(chunk);
      return true;
    }) as never);

    await evaluateFiles([README_PATH], {
      prompts: [createPrompt()],
      rulesPath: undefined,
      provider: {} as never,
      concurrency: 1,
      verbose: false,
      debugJson: false,
      scanPaths: [],
      outputFormat: OutputFormat.Line,
      mode: 'agent',
      print: false,
    });

    expect(stderrOutput).toContain(`⠋ ◈ reviewing ${README_PATH} for packs/default/consistency.md`);
    expect(stderrOutput).toContain('└ calling tool lint tool lint(packs/default/consistency.md...)');
    expect(stderrOutput).toContain(`◆ done ${README_PATH} in`);
    expect(stderrOutput).toContain('◆ done in');
    expect(stderrOutput).toContain('◆ done in');
    expect(stderrOutput).toContain('\n\n');
    restoreTTY();
  });
});
