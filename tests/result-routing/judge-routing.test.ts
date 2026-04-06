import { describe, expect, it, vi } from 'vitest';
import { routeJudgeResult } from '../../src/cli/result-routing/judge-routing';
import { createIssueSink, type IssueSink, type SinkIssue } from '../../src/cli/result-routing/issue-sink';
import { OutputFormat } from '../../src/cli/types';
import { Severity } from '../../src/evaluators/types';
import { JsonFormatter } from '../../src/output/json-formatter';
import type { RuleFile } from '../../src/rules/rule-loader';
import type { JudgeResult } from '../../src/prompts/schema';

function makeRuleFile(overrides?: Partial<RuleFile['meta']>): RuleFile {
  return {
    id: 'review',
    filename: 'review.md',
    fullPath: '/tmp/review.md',
    pack: 'Default',
    content: 'body',
    meta: {
      id: 'Review',
      name: 'Review',
      severity: Severity.WARNING,
      criteria: [{ id: 'Clarity', name: 'Clarity', weight: 2 }],
      ...overrides,
    },
  };
}

function makeJudgeResult(): JudgeResult {
  return {
    type: 'judge',
    final_score: 1,
    criteria: [
      {
        name: 'Clarity',
        weight: 2,
        score: 1,
        normalized_score: 1,
        weighted_points: 2,
        summary: 'This criterion is not met.',
        reasoning: 'The wording is vague.',
        violations: [
          {
            line: 1,
            quoted_text: 'bad phrase',
            context_before: '',
            context_after: '',
            description: 'Vague wording',
            analysis: 'The phrase is vague.',
            message: 'Clarify the wording',
            suggestion: 'Use a specific phrase',
            fix: 'specific phrase',
            rule_quote: 'Prefer specific wording',
            confidence: 0.91,
            checks: {
              evidence_exact: true,
              rule_supports_claim: true,
              context_supports_violation: true,
              plausible_non_violation: false,
              fix_is_drop_in: true,
              fix_preserves_meaning: true,
            },
            check_notes: {},
          },
        ],
      },
    ],
  };
}

class RecordingSink implements IssueSink {
  readonly issues: SinkIssue[] = [];

  reportIssue(issue: SinkIssue): void {
    this.issues.push(issue);
  }
}

describe('routeJudgeResult', () => {
  it('adds json evaluation scores while preserving issue payloads', () => {
    const formatter = new JsonFormatter();
    const sink = createIssueSink(OutputFormat.Json, formatter);

    const result = routeJudgeResult({
      promptFile: makeRuleFile(),
      result: makeJudgeResult(),
      content: 'bad phrase',
      relFile: 'doc.md',
      sink,
    });

    const parsed = JSON.parse(formatter.toJson()) as {
      files: Record<
        string,
        {
          issues: Array<{ rule: string; severity: string; message: string }>;
          evaluationScores: Array<{
            id: string;
            scores: Array<{ criterion?: string; weightedMaxScore: number }>;
          }>;
        }
      >;
    };

    expect(result).toMatchObject({
      errors: 1,
      warnings: 0,
      hadOperationalErrors: false,
      hadSeverityErrors: true,
      scoreEntries: [{ id: 'Default.Review.Clarity', scoreText: '1.0/10', score: 1 }],
    });
    expect(parsed.files['doc.md']?.issues[0]).toMatchObject({
      rule: 'Default.Review.Clarity',
      severity: Severity.ERROR,
      message: 'Clarify the wording',
    });
    expect(parsed.files['doc.md']?.evaluationScores[0]).toMatchObject({
      id: 'Review',
      scores: [{ criterion: 'Clarity', weightedMaxScore: 2 }],
    });
  });

  it('reports missing targets without relying on formatter branches', () => {
    const sink = new RecordingSink();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = routeJudgeResult({
      promptFile: makeRuleFile({
        criteria: [
          {
            id: 'Clarity',
            name: 'Clarity',
            weight: 2,
            target: { regex: '^## Required$', flags: 'm', required: true, suggestion: 'Add ## Required' },
          },
        ],
      }),
      result: makeJudgeResult(),
      content: 'No heading here',
      relFile: 'doc.md',
      sink,
    });

    expect(result).toMatchObject({
      errors: 1,
      warnings: 0,
      hadOperationalErrors: false,
      hadSeverityErrors: true,
      scoreEntries: [{ id: 'Default.Review.Clarity', scoreText: '0.0/10', score: 0 }],
    });
    expect(sink.issues[0]).toMatchObject({
      summary: 'target not found',
      ruleName: 'Default.Review.Clarity',
      severity: Severity.ERROR,
      suggestion: 'Add ## Required',
    });

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
