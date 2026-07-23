import type {
  ReviewDiagnostic,
  ReviewFinding,
  ReviewResult,
  ReviewScore,
} from '../review/types';
import { computeFilterDecision } from '../evaluators/violation-filter';
import {
  verifyFindingEvidence,
  FINDING_EVIDENCE_NOT_LOCATABLE,
  type VerifiedFindingCoords,
} from './finding-evidence-verifier';
import { scoreFindings } from './scorer';
import { buildRuleId, resolveCriterionId } from './severity';
import type { FindingProcessingInput, RawViolation } from './types';

interface VerifiedEntry {
  raw: RawViolation;
  coords: VerifiedFindingCoords;
}

/** Transforms candidate violations into a formatter-ready {@link ReviewResult}. */
export function processFindings(input: FindingProcessingInput): ReviewResult {
  const surfaced = filterCandidates(input.candidateFindings);
  const { verified, evidenceDiagnostics } = verifyAndDedupe(
    surfaced,
    input.targetContent,
  );

  const scored = scoreFindings({
    verifiedViolations: verified.map((entry) => entry.raw),
    wordCount: input.wordCount,
    ...(input.promptMeta.strictness !== undefined
      ? { strictness: input.promptMeta.strictness }
      : {}),
    ...(input.promptMeta.severity !== undefined
      ? { promptSeverity: input.promptMeta.severity }
      : {}),
  });

  const severity = scored.severity;
  const scoreRuleId = buildRuleId(input.pack, input.ruleId);

  const findings: ReviewFinding[] = verified.map(({ raw, coords }) => {
    const criterionId = resolveCriterionId(
      input.promptMeta.criteria,
      raw.criterionName,
    );
    const ruleId = buildRuleId(input.pack, input.ruleId, criterionId);
    const message = (raw.message || raw.analysis || '').trim();
    return {
      ruleId,
      ruleSource: input.ruleSource,
      severity,
      message,
      line: coords.line,
      column: coords.column,
      match: coords.match,
      ...(raw.analysis ? { analysis: raw.analysis } : {}),
      ...(raw.suggestion ? { suggestion: raw.suggestion } : {}),
      ...(raw.fix ? { fix: raw.fix } : {}),
    };
  });

  const scores: ReviewScore[] = [
    {
      ruleId: scoreRuleId,
      score: scored.score,
      scoreText: scored.scoreText,
      severity,
      findingCount: verified.length,
    },
  ];

  const diagnostics: ReviewDiagnostic[] = [...evidenceDiagnostics];
  const hadOperationalErrors = diagnostics.some(
    (diagnostic) => diagnostic.level === 'error',
  );

  return { findings, scores, diagnostics, hadOperationalErrors };
}

/** Drops candidate findings that fail the evidence gate. */
function filterCandidates(candidates: readonly RawViolation[]): RawViolation[] {
  const surfaced: RawViolation[] = [];
  for (const candidate of candidates) {
    const decision = computeFilterDecision(candidate);
    if (decision.surface) {
      surfaced.push(candidate);
    }
  }
  return surfaced;
}

/**
 * Verifies each surfaced finding's evidence and deduplicates verified findings
 * by their anchored coordinates. Unanchored findings become warn diagnostics
 * and are not emitted.
 */
function verifyAndDedupe(
  surfaced: readonly RawViolation[],
  targetContent: string,
): { verified: VerifiedEntry[]; evidenceDiagnostics: ReviewDiagnostic[] } {
  const verified: VerifiedEntry[] = [];
  const evidenceDiagnostics: ReviewDiagnostic[] = [];
  const seen = new Set<string>();

  for (const candidate of surfaced) {
    const verification = verifyFindingEvidence(targetContent, {
      quoted_text: candidate.quoted_text || '',
      ...(candidate.context_before !== undefined
        ? { context_before: candidate.context_before }
        : {}),
      ...(candidate.context_after !== undefined
        ? { context_after: candidate.context_after }
        : {}),
      ...(candidate.line !== undefined ? { line: candidate.line } : {}),
    });

    if (!verification.verified || !verification.finding) {
      evidenceDiagnostics.push({
        level: 'warn',
        code: FINDING_EVIDENCE_NOT_LOCATABLE,
        message:
          verification.diagnostic?.message ??
          'Could not locate finding evidence in target content.',
      });
      continue;
    }

    const coords = verification.finding;
    const dedupeKey = `${coords.line}:${coords.column}:${coords.match}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    verified.push({ raw: candidate, coords });
  }

  return { verified, evidenceDiagnostics };
}
