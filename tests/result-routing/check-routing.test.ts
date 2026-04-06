import { describe, expect, it } from 'vitest';
import { routeCheckResult } from '../../src/cli/result-routing/check-routing';
import { createIssueSink } from '../../src/cli/result-routing/issue-sink';
import { OutputFormat } from '../../src/cli/types';
import { Severity } from '../../src/evaluators/types';
import { JsonFormatter } from '../../src/output/json-formatter';
import type { RuleFile } from '../../src/rules/rule-loader';
import type { RawCheckResult } from '../../src/prompts/schema';

function makeRuleFile(): RuleFile {
  return {
    id: 'consistency',
    filename: 'consistency.md',
    fullPath: '/tmp/consistency.md',
    pack: 'Default',
    content: 'body',
    meta: {
      id: 'Consistency',
      name: 'Consistency',
      severity: Severity.WARNING,
      criteria: [{ id: 'Hook', name: 'Hook' }],
    },
  };
}

function makeCheckResult(): RawCheckResult {
  return {
    type: 'check',
    word_count: 100,
    violations: [
      {
        line: 1,
        analysis: 'The phrase is inconsistent with the style guide.',
        message: 'Avoid this wording',
        suggestion: 'Use approved wording',
        fix: 'better phrase',
        quoted_text: 'bad phrase',
        context_before: '',
        context_after: '',
        criterionName: 'Hook',
        rule_quote: 'Avoid bad phrase',
        confidence: 0.91,
        checks: {
          evidence_exact: true,
          rule_supports_claim: true,
          context_supports_violation: true,
          plausible_non_violation: false,
          fix_is_drop_in: true,
          fix_preserves_meaning: true,
        },
      },
    ],
  };
}

describe('routeCheckResult', () => {
  it('groups surfaced violations by criterion and preserves json issue payloads', () => {
    const formatter = new JsonFormatter();
    const sink = createIssueSink(OutputFormat.Json, formatter);

    const result = routeCheckResult({
      promptFile: makeRuleFile(),
      result: makeCheckResult(),
      content: 'bad phrase',
      relFile: 'doc.md',
      sink,
    });

    const parsed = JSON.parse(formatter.toJson()) as {
      files: Record<string, { issues: Array<{ rule: string; severity: string; suggestion?: string }> }>;
    };

    expect(result).toMatchObject({
      errors: 0,
      warnings: 1,
      hadOperationalErrors: false,
      hadSeverityErrors: false,
      scoreEntries: [{ id: 'Default.Consistency', scoreText: '9.0/10', score: 9 }],
    });
    expect(parsed.files['doc.md']?.issues[0]).toMatchObject({
      rule: 'Default.Consistency.Hook',
      severity: Severity.WARNING,
      suggestion: 'Use approved wording',
    });
  });
});
