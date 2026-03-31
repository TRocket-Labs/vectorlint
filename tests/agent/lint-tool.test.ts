import { mkdtempSync, writeFileSync } from 'fs';
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

const FAKE_PROVIDER: LLMProvider = {
  runPromptStructured() {
    return Promise.resolve({
      data: {
        reasoning: 'detected issue',
        violations: [
          {
            line: 2,
            quoted_text: 'bad phrase',
            context_before: 'This sentence has a ',
            context_after: ' that should be improved.',
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

describe('agent lint tool', () => {
  it('accepts ruleSource instead of ruleKey/ruleId', async () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'vectorlint-agent-'));
    const file = path.join(repo, 'doc.md');
    writeFileSync(file, 'This sentence has a bad phrase that should be improved.\n', 'utf8');

    let calledLint = false;
    const result = await runAgentExecutor({
      targets: [file],
      prompts: [makePrompt()],
      provider: FAKE_PROVIDER,
      repositoryRoot: repo,
      scanPaths: [{ pattern: '**/*.md', runRules: ['Default'], overrides: {} }],
      outputFormat: OutputFormat.Line,
      printMode: true,
      sessionHomeDir: repo,
      maxTurns: 4,
      modelRunner: () => {
        if (!calledLint) {
          calledLint = true;
          return Promise.resolve({
            toolName: 'lint',
            input: {
              file: 'doc.md',
              ruleSource: 'packs/default/consistency.md',
              context: 'optional context',
            },
          });
        }
        return Promise.resolve({ toolName: 'finalize_review', input: {} });
      },
    });

    const first = result.findings[0];
    expect(first).toMatchObject({
      file: 'doc.md',
      ruleSource: 'packs/default/consistency.md',
      ruleId: 'Default.Consistency',
    });
    expect(first?.line).toBeGreaterThan(0);
  });
});
