import { describe, it, expect } from 'vitest';
import { RdJsonFormatter, type RdJsonResult } from '../src/output/rdjson-formatter';
import { Severity } from '../src/evaluators/types';

describe('RdJsonFormatter', () => {
  it('should produce valid RDJSON output', () => {
    const formatter = new RdJsonFormatter();

    formatter.addIssue('test.md', {
      line: 1,
      column: 1,
      span: [1, 6],
      severity: Severity.ERROR,
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
