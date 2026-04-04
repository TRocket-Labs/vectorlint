import stripAnsi from 'strip-ansi';
import { describe, expect, it, vi } from 'vitest';
import { Severity } from '../../src/evaluators/types';
import { JsonFormatter } from '../../src/output/json-formatter';
import { RdJsonFormatter } from '../../src/output/rdjson-formatter';
import { ValeJsonFormatter } from '../../src/output/vale-json-formatter';
import { createIssueSink } from '../../src/cli/result-routing/issue-sink';
import { OutputFormat } from '../../src/cli/types';

const BASE_ISSUE = {
  file: 'doc.md',
  line: 7,
  column: 4,
  severity: Severity.WARNING,
  summary: 'Readable summary',
  ruleName: 'Pack.Rule',
  analysis: 'Detailed analysis',
  suggestion: 'Rewrite it',
  fix: 'Better text',
  scoreText: '8.0/10',
  match: 'bad',
} as const;

describe('createIssueSink', () => {
  it('renders line output through the reporter', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const sink = createIssueSink(OutputFormat.Line, new ValeJsonFormatter());
    sink.reportIssue(BASE_ISSUE);

    const output = stripAnsi(
      consoleSpy.mock.calls.map((call) => String(call[0])).join('\n')
    );

    expect(output).toContain('7:4');
    expect(output).toContain('Readable summary');
    expect(output).toContain('Pack.Rule');
    expect(output).toContain('suggestion:');
    expect(output).toContain('Rewrite it');

    consoleSpy.mockRestore();
  });

  it('writes json issues and evaluation scores without changing payload fields', () => {
    const formatter = new JsonFormatter();
    const sink = createIssueSink(OutputFormat.Json, formatter);

    sink.reportIssue(BASE_ISSUE);
    sink.addEvaluationScore?.('doc.md', {
      id: 'prompt-id',
      scores: [
        {
          criterion: 'Clarity',
          rawScore: 3,
          maxScore: 4,
          weightedScore: 7,
          weightedMaxScore: 10,
          normalizedScore: 7,
          normalizedMaxScore: 10,
        },
      ],
    });

    const parsed = JSON.parse(formatter.toJson()) as {
      files: Record<
        string,
        {
          issues: Array<{
            severity: string;
            rule: string;
            analysis?: string;
            suggestion?: string;
            fix?: string;
          }>;
          evaluationScores: Array<{ id: string }>;
        }
      >;
    };

    expect(parsed.files['doc.md']?.issues[0]).toMatchObject({
      severity: Severity.WARNING,
      rule: 'Pack.Rule',
      analysis: 'Detailed analysis',
      suggestion: 'Rewrite it',
      fix: 'Better text',
    });
    expect(parsed.files['doc.md']?.evaluationScores[0]?.id).toBe('prompt-id');
  });

  it('writes vale-json issues with Vale spans and links', () => {
    const formatter = new ValeJsonFormatter();
    const sink = createIssueSink(OutputFormat.ValeJson, formatter);

    sink.reportIssue(BASE_ISSUE);

    const parsed = JSON.parse(formatter.toJson()) as Record<
      string,
      Array<{ Check: string; Span: [number, number]; Severity: string; Link: string }>
    >;

    expect(parsed['doc.md']?.[0]).toMatchObject({
      Check: 'Pack.Rule',
      Severity: Severity.WARNING,
      Link: 'Rewrite it',
      Span: [4, 7],
    });
  });

  it('writes rdjson diagnostics and keeps evaluation scores disabled', () => {
    const formatter = new RdJsonFormatter();
    const sink = createIssueSink(OutputFormat.RdJson, formatter);

    sink.reportIssue(BASE_ISSUE);

    const parsed = JSON.parse(formatter.toJson()) as {
      diagnostics: Array<{
        message: string;
        severity: string;
        code?: { value?: string };
        location: { range: { start: { column: number }; end?: { column: number } } };
        suggestions?: Array<{ text: string }>;
      }>;
    };

    expect(typeof sink.addEvaluationScore).toBe('undefined');
    expect(parsed.diagnostics[0]).toMatchObject({
      message: 'Readable summary',
      severity: Severity.WARNING,
      code: { value: 'Pack.Rule' },
      suggestions: [{ text: 'Rewrite it' }],
    });
    expect(parsed.diagnostics[0]?.location.range.start.column).toBe(4);
    expect(parsed.diagnostics[0]?.location.range.end?.column).toBe(7);
  });
});
