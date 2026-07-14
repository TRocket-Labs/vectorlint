/**
 * Neutral review-domain contract types for the VectorLint harness.
 *
 * Everything an executor needs to review target content against
 * source-backed rules flows through this module. Callers build a
 * {@link ReviewRequest} and executors return a {@link ReviewResult}.
 *
 * This module is implementation-neutral: it deliberately exposes no legacy
 * scoring-mode, rubric, or model-authored rule-override surface. `modelCall`
 * selects how the reviewer model is invoked, not how rules are scored.
 */

/** Finding/Rule severity. */
export type ReviewSeverity = 'error' | 'warning';

/** Objective Via Negativa condition that counts as a violation when present. */
export interface ReviewViolationCondition {
  id: string;
  description: string;
}

/**
 * Target content under review. The on-page boundary is enforced against this:
 * executors may only read sections of `content`.
 */
export interface ReviewTarget {
  /** Stable absolute URI (file:// or virtual scheme for in-memory content). */
  uri: string;
  /** Full target content. May be paged by an agent executor. */
  content: string;
  /** MIME-ish content type, e.g. 'text/markdown'. */
  contentType: string;
  /** Optional byte length hint; computed from content if absent. */
  byteLength?: number;
}

/**
 * A source-backed, caller-authored rule. Model-authored rule overrides are
 * explicitly disallowed.
 */
export interface ReviewRule {
  /** Stable id, formatted Pack.Rule[.Criterion] in output. */
  id: string;
  /** Canonical source path (where the rule body came from). */
  source: string;
  /** The rule prompt body. Source-backed; never model-authored. */
  body: string;
  /** Human-readable name. */
  name?: string;
  /** 'error' | 'warning'. Defaults to 'warning'. */
  severity?: ReviewSeverity;
  /** Optional structured Via Negativa violation conditions. */
  violationConditions?: ReviewViolationCondition[];
}

/**
 * Caller-supplied context. Explicitly in scope:
 * VectorLint does NOT discover workspace files as context on its own; the
 * caller owns exploration and context gathering.
 */
export interface ReviewContext {
  /** Short label used in diagnostics/tracing. */
  label: string;
  /** The context content itself. */
  content: string;
  /** How this context relates to the target, e.g. 'reference' | 'glossary'. */
  relation?: string;
  /** Optional source URI for provenance. */
  uri?: string;
}

/**
 * The on-page boundary scope: the normalized URIs an executor may read.
 * Built by {@link buildScope} (see boundary.ts) and checked by
 * {@link isInScope}.
 */
export interface ReviewScope {
  /** Normalized absolute URIs that are in scope (target + caller context). */
  readonly allowedUris: ReadonlySet<string>;
}

/**
 * Hard bounds on a single review. These limit work, not
 * output. Executors MUST check these and surface a ReviewDiagnostic (or fail
 * the run) when exceeded.
 */
export interface ReviewBudget {
  maxTargetBytes: number;
  maxCallerContextBytes: number;
  maxChunksPerRule: number;
  maxModelCallsPerReview: number;
  /** Maximum elapsed review time in milliseconds. This is the run timeout. */
  maxWallClockMs: number;
}

/**
 * Controls optional output/telemetry behavior. Diagnostics are always part of
 * ReviewResult; this policy does not hide operational warnings. Payload
 * telemetry is a separate opt-in from metadata telemetry.
 */
export interface ReviewOutputPolicy {
  /** Include usage/cost in the result. */
  includeUsage: boolean;
  /** Opt-in: record prompt/content payloads to telemetry. Default false. */
  recordPayloadTelemetry: boolean;
}

/** A verified finding anchored in the target content. */
export interface ReviewFinding {
  ruleId: string;
  ruleSource: string;
  severity: ReviewSeverity;
  message: string;
  /** 1-based line in the target content. */
  line: number;
  /** 1-based column. */
  column: number;
  /** Verified anchored text. Unverified finding evidence is a diagnostic. */
  match: string;
  analysis?: string;
  suggestion?: string;
  fix?: string;
}

/** A per-rule score produced through shared finding processing. */
export interface ReviewScore {
  ruleId: string;
  score: number;
  /** Human-readable score, e.g. "8.0/10". */
  scoreText: string;
  severity: ReviewSeverity;
  /** Count of verified findings that contributed to this score, if applicable. */
  findingCount?: number;
  components?: ReviewScoreComponent[];
}

export interface ReviewScoreComponent {
  id: string;
  scoreText: string;
  score: number;
  weight?: number;
}

export type ReviewDiagnosticLevel = 'info' | 'warn' | 'error';

/** An operational or finding-processing note. Always part of ReviewResult. */
export interface ReviewDiagnostic {
  level: ReviewDiagnosticLevel;
  /** Stable machine code, e.g. 'finding-evidence-not-locatable'. */
  code: string;
  message: string;
  ruleId?: string;
  /** Extra machine-readable detail (model-call count, evidence preview, ...). */
  context?: Record<string, unknown>;
}

/** Aggregated resource usage for a review run. */
export interface ReviewUsage {
  inputTokens?: number;
  outputTokens?: number;
  modelCalls: number;
  costUsd?: number;
  wallClockMs?: number;
}

/** The output from any executor, produced through shared finding processing. */
export interface ReviewResult {
  findings: ReviewFinding[];
  scores: ReviewScore[];
  diagnostics: ReviewDiagnostic[];
  usage?: ReviewUsage;
  /** True if the run hit an operational error but still returned partial results. */
  hadOperationalErrors?: boolean;
}

/** How to call the reviewer model. 'auto' resolves via chooseModelCall(). */
export type ReviewModelCall = 'single' | 'agent' | 'auto';

/** The complete input to any executor. */
export interface ReviewRequest {
  target: ReviewTarget;
  rules: ReviewRule[];
  /** Caller-supplied, in-scope context (never workspace-discovered). */
  context?: ReviewContext[];
  budget: ReviewBudget;
  outputPolicy: ReviewOutputPolicy;
  /** Reviewer model call shape. 'auto' resolves via chooseModelCall(). */
  modelCall: ReviewModelCall;
}
