import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GENERATE_TEXT_MOCK = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: GENERATE_TEXT_MOCK,
  };
});

import { evaluateFiles } from '../../src/cli/orchestrator';
import { AGENT_EVALUATION_MODE } from '../../src/cli/mode';
import { OutputFormat, type EvaluationOptions } from '../../src/cli/types';
import { Severity } from '../../src/evaluators/types';

interface TracePrompt {
  id: string;
  name: string;
  type: 'check' | 'judge';
  severity: 'error' | 'warning';
  pack: string;
  body: string;
}

interface TraceFixture {
  name: string;
  targets: string[];
  prompts: TracePrompt[];
  agentOutput: {
    findings: unknown[];
  };
}

const TRACE_FIXTURE_PATH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'agent-traces',
  'rdjson-warning-trace.json',
);

function loadFixture(): TraceFixture {
  return JSON.parse(readFileSync(TRACE_FIXTURE_PATH, 'utf-8')) as TraceFixture;
}

function toEvaluationOptions(fixture: TraceFixture): EvaluationOptions {
  return {
    mode: AGENT_EVALUATION_MODE,
    prompts: fixture.prompts.map((prompt) => ({
      id: prompt.id,
      filename: `${prompt.id}.md`,
      fullPath: `/rules/${prompt.id}.md`,
      pack: prompt.pack,
      body: prompt.body,
      meta: {
        id: prompt.id,
        name: prompt.name,
        type: prompt.type,
        severity: prompt.severity,
      },
    })) as never,
    rulesPath: undefined,
    provider: {
      getLanguageModel: () => ({} as never),
      runPromptStructured: vi.fn(),
    } as never,
    concurrency: 1,
    verbose: false,
    debugJson: false,
    scanPaths: [],
    outputFormat: OutputFormat.RdJson,
  };
}

describe('agent trace replay', () => {
  beforeEach(() => {
    GENERATE_TEXT_MOCK.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('replays trace fixture through real agent-mode orchestration', async () => {
    const fixture = loadFixture();
    GENERATE_TEXT_MOCK.mockResolvedValue({
      output: fixture.agentOutput,
      text: JSON.stringify(fixture.agentOutput),
    });

    const result = await evaluateFiles(fixture.targets, toEvaluationOptions(fixture));

    const payload = JSON.parse(
      String(vi.mocked(console.log).mock.calls.at(-1)?.[0]),
    ) as { diagnostics: Array<{ severity: Severity; location: { path: string } }> };

    expect(result.totalErrors).toBe(1);
    expect(result.totalWarnings).toBe(1);
    expect(result.hadSeverityErrors).toBe(true);

    expect(payload.diagnostics).toHaveLength(2);
    expect(payload.diagnostics[0]?.location.path).toBe('docs/guide.md');
    expect(payload.diagnostics[0]?.severity).toBe(Severity.ERROR);
    expect(payload.diagnostics[1]?.location.path).toBe('docs/reference.md');
    expect(payload.diagnostics[1]?.severity).toBe(Severity.WARNING);
  });
});
