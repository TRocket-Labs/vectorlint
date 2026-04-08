import {
  computeFilterDecision,
  type FilterDecision,
} from '../lint/violation-filter';
import { handleUnknownError } from '../errors/index';
import { locateQuotedText } from '../output/location';
import type { Severity } from '../schemas/rule-schemas';
import { type IssueSink } from './result-routing/issue-sink';

interface LocateAndReportViolationsParams {
  violations: Array<{
    line?: number;
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
    message?: string;
    analysis?: string;
    suggestion?: string;
    fix?: string;
  }>;
  content: string;
  relFile: string;
  severity: Severity;
  ruleName: string;
  scoreText: string;
  sink: IssueSink;
  verbose?: boolean;
}

/*
 * Constructs a hierarchical rule name following the pattern:
 * - With criterion: PackName.RuleId.CriterionId
 * - Without criterion: PackName.RuleId
 */
export function buildRuleName(
  packName: string,
  ruleId: string,
  criterionId: string | undefined
): string {
  const parts = [packName, ruleId].filter(Boolean);
  if (criterionId) {
    parts.push(criterionId);
  }
  return parts.join('.');
}

/*
 * Locates and reports each violation using pre/post evidence markers.
 * If location matching fails (missing markers, content mismatch), logs warning
 * and continues processing. Returns hadOperationalErrors=true if any violations
 * couldn't be located, signaling text matching issues vs. content quality issues.
 */
export function locateAndReportViolations(params: LocateAndReportViolationsParams): {
  hadOperationalErrors: boolean;
} {
  const {
    violations,
    content,
    relFile,
    severity,
    ruleName,
    scoreText,
    sink,
    verbose,
  } = params;

  let hadOperationalErrors = false;

  // Locate all violations and filter out those that can't be verified
  // Then de-duplicate by (quoted_text, line)
  const seen = new Set<string>();
  const verifiedViolations: Array<{
    v: (typeof violations)[0];
    line: number;
    column: number;
    matchedText: string;
    rowSummary: string;
  }> = [];

  for (const v of violations) {
    if (!v) continue;

    const rowSummary = (v.message || '').trim();

    try {
      const locWithMatch = locateQuotedText(
        content,
        {
          quoted_text: v.quoted_text || '',
          context_before: v.context_before || '',
          context_after: v.context_after || '',
        },
        80,
        v.line
      );

      if (!locWithMatch) {
        // Can't verify this quote exists - skip it entirely
        if (verbose) {
          console.warn(
            `[vectorlint] Skipping unverifiable quote: "${v.quoted_text}"`
          );
        }
        hadOperationalErrors = true;
        continue;
      }

      const line = locWithMatch.line;
      const column = locWithMatch.column;
      const matchedText = locWithMatch.match || '';

      // De-duplicate by (quoted_text, line) - skip if quoted_text is empty
      const dedupeKey = v.quoted_text ? `${v.quoted_text}:${line}` : null;
      if (dedupeKey && seen.has(dedupeKey)) {
        continue;
      }
      if (dedupeKey) {
        seen.add(dedupeKey);
      }

      verifiedViolations.push({ v, line, column, matchedText, rowSummary });
    } catch (e: unknown) {
      const err = handleUnknownError(e, 'Locating evidence');
      if (verbose) {
        console.warn(`[vectorlint] Error locating evidence: ${err.message}`);
      }
      hadOperationalErrors = true;
    }
  }

  // Report only verified, unique violations
  for (const {
    v,
    line,
    column,
    matchedText,
    rowSummary,
  } of verifiedViolations) {
    sink.reportIssue({
      file: relFile,
      line,
      column,
      severity,
      summary: rowSummary,
      ruleName,
      ...(v.analysis !== undefined && { analysis: v.analysis }),
      ...(v.suggestion !== undefined && { suggestion: v.suggestion }),
      ...(v.fix !== undefined && { fix: v.fix }),
      scoreText,
      match: matchedText,
    });
  }

  return { hadOperationalErrors };
}

export function getViolationFilterResults<
  TViolation extends Parameters<typeof computeFilterDecision>[0]
>(
  violations: TViolation[]
): {
  decisions: FilterDecision[];
  surfacedViolations: TViolation[];
} {
  const decisions = violations.map((v) => computeFilterDecision(v));
  const surfacedViolations = violations.filter(
    (_v, i) => decisions[i]?.surface === true
  );

  return { decisions, surfacedViolations };
}
