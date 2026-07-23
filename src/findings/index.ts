/** Shared candidate-to-finding processing pipeline. */
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

export { scoreFindings, type ScoreOptions, type ScoredFindings } from './scorer';

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
