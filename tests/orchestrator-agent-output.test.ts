import { describe, it, expect } from 'vitest';
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
});
