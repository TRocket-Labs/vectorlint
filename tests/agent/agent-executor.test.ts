import { mkdtempSync, symlinkSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { runAgentExecutor } from '../../src/agent/executor';
import type { PromptFile } from '../../src/prompts/prompt-loader';
import type { LLMProvider } from '../../src/providers/llm-provider';
import { Severity } from '../../src/evaluators/types';
import { OutputFormat } from '../../src/cli/types';

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

function makeProvider(): LLMProvider {
  return {
    runPromptStructured() {
      return Promise.resolve({
        data: {
          reasoning: 'detected issue',
          violations: [
            {
              line: 1,
              quoted_text: 'bad phrase',
              context_before: '',
              context_after: '',
              description: 'Bad phrase used',
              analysis: 'This wording is inconsistent.',
              message: 'Use consistent wording',
              suggestion: 'Replace bad phrase',
              fix: 'better phrase',
              rule_quote: 'Avoid vague wording',
              checks: {
                rule_supports_claim: true,
                evidence_exact: true,
                context_supports_violation: true,
                plausible_non_violation: false,
                fix_is_drop_in: true,
                fix_preserves_meaning: true,
              },
              check_notes: {
                rule_supports_claim: 'clear',
                evidence_exact: 'exact',
                context_supports_violation: 'yes',
                plausible_non_violation: 'none',
                fix_is_drop_in: 'yes',
                fix_preserves_meaning: 'yes',
              },
              confidence: 0.95,
            },
          ],
        },
      });
    },
  };
}

function setupRepo(): { repo: string; file: string; prompt: PromptFile; provider: LLMProvider } {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
  const file = path.join(repo, 'doc.md');
  writeFileSync(file, 'bad phrase\n', 'utf8');
  return {
    repo,
    file,
    prompt: makePrompt(),
    provider: makeProvider(),
  };
}

describe('agent executor contracts', () => {
  it('builds stable rule-source registry from fileRuleMap', async () => {
    const setup = setupRepo();
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 3,
      modelRunner: () => Promise.resolve({ toolName: 'finalize_review', input: {} }),
    });

    expect(result.validRuleSources.length).toBeGreaterThan(0);
    expect(result.validRuleSources).toContain('packs/default/consistency.md');
  });

  it('maps inline findings to canonical Pack.Rule IDs from runtime ruleSource registry', async () => {
    const setup = setupRepo();
    let calledLint = false;
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 3,
      modelRunner: () => {
        if (!calledLint) {
          calledLint = true;
          return Promise.resolve({
            toolName: 'lint',
            input: {
              file: 'doc.md',
              ruleSource: 'packs/default/consistency.md',
            },
          });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    expect(result.findings[0]?.ruleId).toBe('Default.Consistency');
  });

  it('exposes required read-only tools in runtime toolset', async () => {
    const setup = setupRepo();
    let availableTools: string[] = [];
    await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 1,
      modelRunner: (context) => {
        availableTools = context.availableTools;
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    expect(availableTools).toEqual(
      expect.arrayContaining([
        'lint',
        'report_finding',
        'finalize_review',
        'read_file',
        'search_files',
        'list_directory',
      ])
    );
  });

  it('rejects read_file paths outside repository root', async () => {
    const setup = setupRepo();
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 2,
      modelRunner: (context) => {
        if (context.transcript.length === 0) {
          return Promise.resolve({ toolName: 'read_file', input: { path: '../outside.txt' } });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    const failed = result.events.find(
      (event) => event.eventType === 'tool_call_finished' && event.payload.toolName === 'read_file'
    );
    expect(failed?.payload.success).toBe(false);
  });

  it('rejects list_directory paths outside repository root', async () => {
    const setup = setupRepo();
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 2,
      modelRunner: (context) => {
        if (context.transcript.length === 0) {
          return Promise.resolve({ toolName: 'list_directory', input: { path: '../outside' } });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    const failed = result.events.find(
      (event) =>
        event.eventType === 'tool_call_finished' && event.payload.toolName === 'list_directory'
    );
    expect(failed?.payload.success).toBe(false);
  });

  it('validates report_finding references are repository-bounded', async () => {
    const setup = setupRepo();
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 2,
      modelRunner: (context) => {
        if (context.transcript.length === 0) {
          return Promise.resolve({
            toolName: 'report_finding',
            input: {
              kind: 'top-level',
              ruleSource: 'packs/default/consistency.md',
              message: 'Cross-file issue',
              references: [{ file: '../outside.md', startLine: 1, endLine: 1 }],
            },
          });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    const failed = result.events.find(
      (event) =>
        event.eventType === 'tool_call_finished' && event.payload.toolName === 'report_finding'
    );
    expect(failed?.payload.success).toBe(false);
  });

  it('fails hard when finalize_review is not called', async () => {
    const setup = setupRepo();
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 1,
      modelRunner: () => Promise.resolve({
        toolName: 'lint',
        input: { file: 'doc.md', ruleSource: 'packs/default/consistency.md' },
      }),
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.errorMessage).toContain('finalize_review was not called');
  });

  it('does not crash runtime when lint tool fails', async () => {
    const setup = setupRepo();
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 2,
      modelRunner: (context) => {
        if (context.transcript.length === 0) {
          return Promise.resolve({
            toolName: 'lint',
            input: { file: '../outside.md', ruleSource: 'packs/default/consistency.md' },
          });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    expect(result.hadOperationalErrors).toBe(true);
    expect(result.events.some((event) => event.eventType === 'session_finalized')).toBe(true);
  });

  it('rejects search_files invalid regex patterns', async () => {
    const setup = setupRepo();
    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 2,
      modelRunner: (context) => {
        if (context.transcript.length === 0) {
          return Promise.resolve({ toolName: 'search_files', input: { pattern: '[unclosed' } });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    const failed = result.events.find(
      (event) => event.eventType === 'tool_call_finished' && event.payload.toolName === 'search_files'
    );
    expect(failed?.payload.success).toBe(false);
  });

  it('rejects read_file symlink escapes outside repository root', async () => {
    const setup = setupRepo();
    const outsideFile = path.join(os.tmpdir(), `outside-${Date.now()}.md`);
    writeFileSync(outsideFile, 'outside', 'utf8');
    const symlinkPath = path.join(setup.repo, 'outside-link.md');
    symlinkSync(outsideFile, symlinkPath);

    const result = await runAgentExecutor({
      targets: [setup.file],
      prompts: [setup.prompt],
      provider: setup.provider,
      repositoryRoot: setup.repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Json,
      printMode: true,
      sessionHomeDir: setup.repo,
      maxTurns: 2,
      modelRunner: (context) => {
        if (context.transcript.length === 0) {
          return Promise.resolve({ toolName: 'read_file', input: { path: 'outside-link.md' } });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    const failed = result.events.find(
      (event) => event.eventType === 'tool_call_finished' && event.payload.toolName === 'read_file'
    );
    expect(failed?.payload.success).toBe(false);
  });
});
