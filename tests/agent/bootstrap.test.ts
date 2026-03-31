import { describe, it, expect } from 'vitest';
import { evaluateFiles } from '../../src/cli/orchestrator';
import { OutputFormat } from '../../src/cli/types';

describe('agent runtime bootstrap', () => {
  it('imports agent runtime entrypoints from src/agent without module-not-found', async () => {
    await expect(import('../../src/agent')).resolves.toBeTruthy();
  });

  it('agent mode command path resolves with no legacy branch dependency', async () => {
    const result = await evaluateFiles([], {
      prompts: [],
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

    expect(result).toMatchObject({
      totalFiles: 0,
      totalErrors: 0,
      totalWarnings: 0,
    });
  });
});
