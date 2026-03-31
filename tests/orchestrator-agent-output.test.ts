import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
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

describe('orchestrator agent mode output', () => {
  it('returns non-zero evaluation when agent finalize is missing', async () => {
    const evalResult = await evaluateFiles([path.join(process.cwd(), 'README.md')], {
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
            file: path.join(process.cwd(), 'README.md'),
            ruleSource: 'packs/default/consistency.md',
          });
        },
      },
    });

    expect(evalResult.hadOperationalErrors).toBe(true);
  });

  it('derives final findings from session replay, not free-form model text', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await evaluateFiles([path.join(process.cwd(), 'README.md')], {
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
        runRule: async () => ({
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
            file: path.join(process.cwd(), 'README.md'),
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

    await evaluateFiles([path.join(process.cwd(), 'README.md')], {
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
        runRule: async () => ({
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
            file: path.join(process.cwd(), 'README.md'),
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
});
