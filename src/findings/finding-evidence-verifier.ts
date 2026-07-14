import { locateQuotedText, type LocationWithMatch } from '../output/location';

/** Stable machine code emitted when finding evidence cannot be anchored. */
export const FINDING_EVIDENCE_NOT_LOCATABLE = 'finding-evidence-not-locatable' as const;

/** Evidence markers a model returns for a candidate finding. */
export interface FindingEvidenceInput {
  quoted_text: string;
  context_before?: string;
  context_after?: string;
  /** Optional 1-based line hint from the model; never used as a fallback. */
  line?: number;
}

/** Located coordinates for a verified finding, anchored in target content. */
export interface VerifiedFindingCoords {
  /** 1-based line in the target content. */
  line: number;
  /** 1-based column. */
  column: number;
  /** Verified anchored text. */
  match: string;
}

/** Operational note produced when evidence cannot be verified. */
export interface FindingEvidenceDiagnostic {
  code: string;
  level: 'warn' | 'error';
  message: string;
}

/** The outcome of verifying a single candidate finding's evidence. */
export interface FindingEvidenceVerification {
  verified: boolean;
  finding?: VerifiedFindingCoords;
  diagnostic?: FindingEvidenceDiagnostic;
}

/**
 * The single source of truth for finding evidence verification
 * (audit Finding #6).
 *
 * Wraps the existing `locateQuotedText` fuzzy matcher; it never reimplements
 * matching. On a successful anchor it returns a verified finding with the
 * located line/column/match. When the quoted text cannot be anchored it
 * returns a `finding-evidence-not-locatable` warn diagnostic and NO finding —
 * it never falls back to a model-provided line number the way the unreleased
 * internal agent implementation did.
 */
export function verifyFindingEvidence(
  content: string,
  findingEvidence: FindingEvidenceInput,
): FindingEvidenceVerification {
  const location: LocationWithMatch | null = locateQuotedText(
    content,
    {
      quoted_text: findingEvidence.quoted_text || '',
      context_before: findingEvidence.context_before || '',
      context_after: findingEvidence.context_after || '',
    },
    80,
    findingEvidence.line,
  );

  if (!location) {
    return {
      verified: false,
      diagnostic: {
        code: FINDING_EVIDENCE_NOT_LOCATABLE,
        level: 'warn',
        message: `Could not locate quoted text "${(findingEvidence.quoted_text || '').slice(0, 60)}" in target content.`,
      },
    };
  }

  return {
    verified: true,
    finding: {
      line: location.line,
      column: location.column,
      match: location.match,
    },
  };
}
