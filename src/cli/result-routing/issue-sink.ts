import type { Severity } from '../../evaluators/types';
import { JsonFormatter, type EvaluationScore, type Issue } from '../../output/json-formatter';
import { RdJsonFormatter } from '../../output/rdjson-formatter';
import { printIssueRow } from '../../output/reporter';
import { ValeJsonFormatter, type JsonIssue } from '../../output/vale-json-formatter';
import { OutputFormat } from '../types';

export type OutputFormatter = ValeJsonFormatter | JsonFormatter | RdJsonFormatter;

export interface SinkIssue {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  summary: string;
  ruleName: string;
  analysis?: string;
  suggestion?: string;
  fix?: string;
  scoreText?: string;
  match?: string;
}

export interface IssueSink {
  reportIssue(issue: SinkIssue): void;
  addEvaluationScore?(file: string, score: EvaluationScore): void;
}

class LineIssueSink implements IssueSink {
  reportIssue(issue: SinkIssue): void {
    const locStr = `${issue.line}:${issue.column}`;
    printIssueRow(
      locStr,
      issue.severity,
      issue.summary,
      issue.ruleName,
      issue.suggestion ? { suggestion: issue.suggestion } : {}
    );
  }
}

class ValeJsonIssueSink implements IssueSink {
  constructor(private readonly formatter: ValeJsonFormatter) {}

  reportIssue(issue: SinkIssue): void {
    const payload: JsonIssue = {
      file: issue.file,
      line: issue.line,
      column: issue.column,
      severity: issue.severity,
      message: issue.summary,
      rule: issue.ruleName,
      match: issue.match || '',
      matchLength: issue.match ? issue.match.length : 0,
      ...(issue.suggestion !== undefined ? { suggestion: issue.suggestion } : {}),
      ...(issue.fix !== undefined ? { fix: issue.fix } : {}),
      ...(issue.scoreText !== undefined ? { score: issue.scoreText } : {}),
    };
    this.formatter.addIssue(payload);
  }
}

class StructuredIssueSink implements IssueSink {
  constructor(private readonly formatter: JsonFormatter | RdJsonFormatter) {}

  reportIssue(issue: SinkIssue): void {
    const matchLen = issue.match ? issue.match.length : 0;
    const payload: Issue = {
      line: issue.line,
      column: issue.column,
      span: [issue.column, issue.column + matchLen],
      severity: issue.severity,
      message: issue.summary,
      rule: issue.ruleName,
      match: issue.match || '',
      ...(issue.analysis ? { analysis: issue.analysis } : {}),
      ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
      ...(issue.fix ? { fix: issue.fix } : {}),
    };
    this.formatter.addIssue(issue.file, payload);
  }
}

class JsonIssueSink extends StructuredIssueSink {
  constructor(private readonly jsonFormatter: JsonFormatter) {
    super(jsonFormatter);
  }

  addEvaluationScore(file: string, score: EvaluationScore): void {
    this.jsonFormatter.addEvaluationScore(file, score);
  }
}

export function createIssueSink(
  outputFormat: OutputFormat,
  formatter: OutputFormatter
): IssueSink {
  switch (outputFormat) {
    case OutputFormat.Line:
      return new LineIssueSink();
    case OutputFormat.Json:
      return new JsonIssueSink(formatter as JsonFormatter);
    case OutputFormat.RdJson:
      return new StructuredIssueSink(formatter as RdJsonFormatter);
    case OutputFormat.ValeJson:
      return new ValeJsonIssueSink(formatter as ValeJsonFormatter);
  }
}
