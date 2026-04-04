import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { evaluateFile } from '../src/cli/file-evaluation';
import { OutputFormat } from '../src/cli/types';
import { JsonFormatter } from '../src/output/json-formatter';
import { createFilePatternConfig } from './utils.js';

vi.mock('../src/evaluators/index', () => ({
  createEvaluator: vi.fn(() => ({
    evaluate: vi.fn(),
  })),
}));

function createTempFile(content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vectorlint-file-eval-'));
  const filePath = path.join(dir, 'input.md');
  writeFileSync(filePath, content);
  return filePath;
}

describe('evaluateFile', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('returns zeroed metrics when the file matches no scanPaths entry', async () => {
    const file = createTempFile('Hello world\n');

    // scanPaths covers a different glob — this file will not match
    const scanPaths = [createFilePatternConfig('docs/**/*.md', ['VectorLint'])];

    const result = await evaluateFile({
      file,
      options: {
        prompts: [],
        rulesPath: undefined,
        provider: {} as never,
        concurrency: 1,
        verbose: false,
        debugJson: false,
        scanPaths,
        outputFormat: OutputFormat.Line,
      },
      jsonFormatter: new JsonFormatter(),
    });

    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.requestFailures).toBe(0);
    expect(result.hadOperationalErrors).toBe(false);
    expect(result.hadSeverityErrors).toBe(false);
  });
});
