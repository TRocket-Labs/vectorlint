import { describe, it, expect } from 'vitest';
import { filterDuplicateIssues } from '../src/cli/issue-deduplication';
import { RawIssue, OutputFormat } from '../src/cli/types';
import { Severity } from '../src/evaluators/types';
import { JsonFormatter } from '../src/output/json-formatter';

const BASE_ISSUE: RawIssue = {
    file: 'test.md',
    line: 10,
    column: 5,
    severity: Severity.WARNING,
    summary: 'A test issue',
    ruleName: 'Test.Rule',
    outputFormat: OutputFormat.Json,
    jsonFormatter: new JsonFormatter(),
    match: 'test match text',
};

describe('filterDuplicateIssues', () => {
    it('returns a single issue as-is', () => {
        const issues = [BASE_ISSUE];
        expect(filterDuplicateIssues(issues)).toEqual(issues);
    });

    it('deduplicates based on exact file, line, and match', () => {
        const i1 = { ...BASE_ISSUE, summary: 'First summary' };
        const i2 = { ...BASE_ISSUE, summary: 'Second summary', severity: Severity.ERROR };
        const i3 = { ...BASE_ISSUE, summary: 'Third summary len' };

        // i3 wins because it has the longest summary length (17 > 14 > 13).
        const filtered = filterDuplicateIssues([i1, i2, i3]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0]).toBe(i3);
    });

    it('prefers rule with a suggestion', () => {
        const i1 = { ...BASE_ISSUE, summary: 'Longest summary by far but no suggestion', severity: Severity.ERROR };
        const i2 = { ...BASE_ISSUE, summary: 'Short', suggestion: 'Fix this' };

        // i2 wins because it provides a suggestion, superseding summary length and severity.
        const filtered = filterDuplicateIssues([i1, i2]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0]).toBe(i2);
    });

    it('uses longer summary as tie breaker 1 (if no suggestion)', () => {
        const i1 = { ...BASE_ISSUE, summary: 'Short sum', severity: Severity.ERROR };
        const i2 = { ...BASE_ISSUE, summary: 'A much longer summary text', severity: Severity.ERROR };

        // i2 wins because it has a longer summary.
        const filtered = filterDuplicateIssues([i1, i2]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0]).toBe(i2);
    });

    it('uses higher severity as tie breaker 2', () => {
        const i1 = { ...BASE_ISSUE, summary: 'Same len', severity: Severity.WARNING };
        const i2 = { ...BASE_ISSUE, summary: 'Same len', severity: Severity.ERROR };

        // i2 wins because ERROR takes precedence over WARNING.
        const filtered = filterDuplicateIssues([i1, i2]);
        expect(filtered).toHaveLength(1);
        expect(filtered[0]).toBe(i2);
    });

    it('keeps multiple issues on same line if match property is empty', () => {
        const i1 = { ...BASE_ISSUE, match: '', summary: 'One issue' };
        const i2 = { ...BASE_ISSUE, match: '', summary: 'Another issue' };

        // Both are kept since duplicate overlap cannot be explicitly verified without match text.
        const filtered = filterDuplicateIssues([i1, i2]);
        expect(filtered).toHaveLength(2);
        expect(filtered).toContain(i1);
        expect(filtered).toContain(i2);
    });

    it('does not deduplicate issues with different lines or different match text', () => {
        const i1 = { ...BASE_ISSUE, match: 'match A' };
        const i2 = { ...BASE_ISSUE, match: 'match B' };
        const i3 = { ...BASE_ISSUE, line: 11, match: 'match A' };

        const filtered = filterDuplicateIssues([i1, i2, i3]);
        expect(filtered).toHaveLength(3);
    });
});
