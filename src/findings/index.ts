/**
 * Shared finding-processing layer (Phase 3).
 *
 * Transforms raw candidate violation findings into a formatter-ready
 * `ReviewResult` through one pipeline: evidence verification, filtering,
 * count/density scoring, severity resolution, and diagnostics.
 *
 * This module is independent of model call (`single` | `agent`) and contains
 * no legacy `judge`, `evaluator`, rubric, or autonomous-loop output
 * compatibility code. See
 * docs/plans/2026-07-10-phase-3-share-result-projection.md.
 */
export {
  FINDING_EVIDENCE_NOT_LOCATABLE,
  verifyFindingEvidence,
  type FindingEvidenceDiagnostic,
  type FindingEvidenceInput,
  type FindingEvidenceVerification,
  type VerifiedFindingCoords,
} from './finding-evidence-verifier';

export {
  buildRuleId,
  resolveCriterionId,
  resolveSeverity,
  type SeverityInput,
} from './severity';

export { scoreCheck, type ScoreCheckOptions, type ScoredCheck } from './scorer';

export {
  processFindings,
} from './processor';

export {
  FINDING_PROCESSING_INPUT_SCHEMA,
  FINDINGS_CRITERION_SCHEMA,
  GATE_CHECKS_SCHEMA,
  PROMPT_META_FOR_FINDINGS_SCHEMA,
  RAW_VIOLATION_SCHEMA,
  type FindingsCriterion,
  type FindingProcessingInput,
  type GateChecks,
  type PromptMetaForFindings,
  type RawViolation,
  type RuleSeverity,
  type Strictness,
} from './types';
