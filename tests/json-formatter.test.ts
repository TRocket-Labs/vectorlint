import { describe, it, expect } from 'vitest';
import { ValeJsonFormatter } from '../src/output/vale-json-formatter';
import { RdJsonFormatter, type RdJsonResult } from '../src/output/rdjson-formatter';

describe('ValeJsonFormatter', () => {
  it('should format issues into Vale-compatible JSON structure', () => {
    const formatter = new ValeJsonFormatter();

    formatter.addIssue({
      file: 'test.md',
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Test error message',
      rule: 'TestRule.TestCriterion',
      match: 'matched text',
      matchLength: 12,
      suggestion: 'Fix this issue'
    });

    formatter.addIssue({
      file: 'test.md',
      line: 5,
      column: 10,
      severity: 'warning',
      message: 'Test warning message',
      rule: 'TestRule.AnotherCriterion',
      match: ''
    });

    formatter.addIssue({
      file: 'another.md',
      line: 2,
      column: 3,
      severity: 'error',
      message: 'Another error',
      rule: 'AnotherRule.Criterion',
      match: 'error text',
      matchLength: 10
    });

    const result = formatter.toValeFormat();

    expect(result).toHaveProperty('test.md');
    expect(result).toHaveProperty('another.md');
    expect(result['test.md']).toHaveLength(2);
    expect(result['another.md']).toHaveLength(1);

    // Check first issue structure
    const firstIssue = result['test.md']![0]!;
    expect(firstIssue.Check).toBe('TestRule.TestCriterion');
    expect(firstIssue.Description).toBe('');
    expect(firstIssue.Message).toBe('Test error message');
    expect(firstIssue.Line).toBe(1);
    // Span should be [column, column + matchLength] = [1, 1 + 12] = [1, 13]
    expect(firstIssue.Span).toEqual([1, 13]);
    expect(firstIssue.Match).toBe('matched text');
    expect(firstIssue.Severity).toBe('error');
    expect(firstIssue.Link).toBe('Fix this issue');

    // Check issue without suggestion
    const secondIssue = result['test.md']![1]!;
    expect(secondIssue.Check).toBe('TestRule.AnotherCriterion');
    expect(secondIssue.Match).toBe('');
    expect(secondIssue.Link).toBe('');
  });

  it('should provide correct summary statistics', () => {
    const formatter = new ValeJsonFormatter();

    formatter.addIssue({
      file: 'test1.md',
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Error 1',
      rule: 'Rule1',
      match: ''
    });

    formatter.addIssue({
      file: 'test1.md',
      line: 2,
      column: 1,
      severity: 'warning',
      message: 'Warning 1',
      rule: 'Rule2',
      match: ''
    });

    formatter.addIssue({
      file: 'test2.md',
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Error 2',
      rule: 'Rule3',
      match: ''
    });

    const summary = formatter.getSummary();

    expect(summary.files).toBe(2);
    expect(summary.errors).toBe(2);
    expect(summary.warnings).toBe(1);
    expect(summary.suggestions).toBe(0);
  });

  it('should produce valid JSON output', () => {
    const formatter = new ValeJsonFormatter();

    formatter.addIssue({
      file: 'test.md',
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Test message',
      rule: 'TestRule',
      match: ''
    });

    const jsonOutput = formatter.toJson();

    // Should be valid JSON
    expect(() => {
      JSON.parse(jsonOutput);
    }).not.toThrow();

    // Should match expected Vale structure
    const parsed: unknown = JSON.parse(jsonOutput);
    expect(parsed).toHaveProperty('test.md');
  });

  it('should produce valid RDJSON output', () => {
    const formatter = new RdJsonFormatter();

    formatter.addIssue('test.md', {
      line: 1,
      column: 1,
      span: [1, 6],
      severity: 'error',
      message: 'Test message',
      eval: 'TestRule',
      match: 'match',
      suggestion: 'fix'
    });

    const rdjsonOutput = formatter.toJson();

    // Should be valid JSON
    expect(() => {
      JSON.parse(rdjsonOutput);
    }).not.toThrow();

    const parsed = JSON.parse(rdjsonOutput) as RdJsonResult;
    expect(parsed).toHaveProperty('source');
    expect(parsed.source.name).toBe('vectorlint');
    expect(parsed).toHaveProperty('diagnostics');
    expect(parsed.diagnostics).toHaveLength(1);

    const diag = parsed.diagnostics[0]!;
    expect(diag.message).toBe('Test message');
    expect(diag.severity).toBe('ERROR');
    expect(diag.location.path).toBe('test.md');
    expect(diag.location.range.start.line).toBe(1);
    expect(diag.location.range.start.column).toBe(1);
    expect(diag.location.range.end!.column).toBe(6); // 1 + length of 'match' (5)

    expect(diag.suggestions).toHaveLength(1);
    expect(diag.suggestions![0]!.text).toBe('fix');
  });
});
