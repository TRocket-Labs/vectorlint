import { RawIssue } from './types';
import { Severity } from '../evaluators/types';

// Map severities to their relative rank for tie-breaking.
const SEVERITY_RANK: Record<Severity, number> = {
    [Severity.ERROR]: 3,
    [Severity.WARNING]: 2,
};

/**
 * Filter and deduplicate overlapping issues to reduce noise.
 * Groups by exact (file, line, match) and picks the best issue heuristically.
 * 
 * Deduplication Heuristic:
 * 1. Prefer rules with a `suggestion` (to make the error actionable).
 * 2. Tie breaker 1: Pick the one with the longest `summary` (to provide maximum context).
 * 3. Tie breaker 2: Prefer higher severity (`ERROR` > `WARNING`).
 * 4. Tie breaker 3: Default to the first one evaluated.
 * 
 * Note: Issues with an empty `match` text are explicitly preserved and not deduplicated 
 * against each other, as their exact overlap cannot be verified.
 */
export function filterDuplicateIssues(issues: RawIssue[]): RawIssue[] {
    const grouped = new Map<string, RawIssue[]>();

    for (const issue of issues) {
        const matchText = issue.match || '';
        const key = `${issue.file}:${issue.line}:${matchText}`;

        const group = grouped.get(key) || [];
        group.push(issue);
        grouped.set(key, group);
    }

    const filtered: RawIssue[] = [];

    for (const group of grouped.values()) {
        const first = group[0];
        if (!first) continue;

        const matchText = first.match || '';
        if (matchText === '' && group.length > 1) {
            filtered.push(...group);
            continue;
        }

        if (group.length === 1) {
            filtered.push(first);
            continue;
        }

        const best = group.reduce((prev, curr) => {
            // 1. Prefer suggestion
            const prevHas = !!prev.suggestion;
            const currHas = !!curr.suggestion;
            if (currHas !== prevHas) return currHas ? curr : prev;

            // 2. Tie breaker 1: longest summary
            const prevLen = prev.summary?.length || 0;
            const currLen = curr.summary?.length || 0;
            if (currLen !== prevLen) return currLen > prevLen ? curr : prev;

            // 3. Tie breaker 2: higher severity
            const prevRank = SEVERITY_RANK[prev.severity] || 0;
            const currRank = SEVERITY_RANK[curr.severity] || 0;
            if (currRank !== prevRank) return currRank > prevRank ? curr : prev;

            // 4. Tie breaker 3: First evaluated (prev is always earlier in array)
            return prev;
        });

        filtered.push(best);
    }

    return filtered;
}
