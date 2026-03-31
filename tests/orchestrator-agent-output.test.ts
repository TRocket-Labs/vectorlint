import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { evaluateFiles } from '../src/cli/orchestrator';
import { OutputFormat, RunMode } from '../src/cli/types';
import type { PromptFile } from '../src/prompts/prompt-loader';
import type { LLMProvider } from '../src/providers/llm-provider';
import { Severity } from '../src/evaluators/types';

const PROVIDER: LLMProvider = {
  runPromptStructured() {
    return Promise.resolve({
      data: {
        reasoning: 'ok',
        violations: [],
      },
    });
  },
};

function makePrompt(): PromptFile {
  return {
    id: 'consistency',
    filename: 'consistency.md',
    fullPath: 'packs/default/consistency.md',
    pack: 'Default',
    body: 'Find inconsistent wording',
    meta: {
      id: 'Consistency',
      name: 'Consistency',
      type: 'check',
      severity: Severity.WARNING,
    },
  };
}

describe('agent orchestrator output', () => {
  it('runs agent mode through the default production execution path', async () => {
    const repo = mkdtempSync(path.join(process.cwd(), 'tmp-agent-orch-'));
    const file = path.join(repo, 'doc.md');
    const relFile = path.relative(process.cwd(), file);
    writeFileSync(file, 'bad phrase\n', 'utf8');

    let calledLint = false;
    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: PROVIDER,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: RunMode.Agent,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      agentModelRunner: () => {
        if (!calledLint) {
          calledLint = true;
          return Promise.resolve({
            toolName: 'lint',
            input: { file: relFile, ruleSource: 'packs/default/consistency.md' },
          });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
      agentMaxTurns: 3,
    });
    rmSync(repo, { recursive: true, force: true });

    expect(result.totalFiles).toBe(1);
    expect(result.hadOperationalErrors).toBe(false);
  });

  it('returns explicit operational error when model-driven execution cannot start', async () => {
    const repo = mkdtempSync(path.join(process.cwd(), 'tmp-agent-orch-'));
    const file = path.join(repo, 'doc.md');
    const relFile = path.relative(process.cwd(), file);
    writeFileSync(file, 'bad phrase\n', 'utf8');

    const result = await evaluateFiles([file], {
      prompts: [makePrompt()],
      rulesPath: undefined,
      provider: PROVIDER,
      concurrency: 1,
      verbose: false,
      outputFormat: OutputFormat.Json,
      mode: RunMode.Agent,
      printMode: true,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      agentModelRunner: () => {
        void relFile;
        return Promise.reject(new Error('model runtime unavailable'));
      },
      agentMaxTurns: 1,
    });
    rmSync(repo, { recursive: true, force: true });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.requestFailures).toBe(1);
  });
});
