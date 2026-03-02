import type { GateChecks } from "../prompts/schema";

export type FilterDecision = {
  surface: boolean;
  reasons: string[];
};

const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;
const CONFIDENCE_THRESHOLD_ENV = "CONFIDENCE_THRESHOLD";

type GateViolationLike = {
  rule_quote?: string;
  fix?: string;
  confidence?: number;
  checks?: GateChecks;
};

function resolveConfidenceThreshold(): number {
  const thresholdRaw = process.env[CONFIDENCE_THRESHOLD_ENV];
  const parsedThreshold =
    thresholdRaw !== undefined ? Number.parseFloat(thresholdRaw) : Number.NaN;

  return Number.isFinite(parsedThreshold) &&
    parsedThreshold >= 0 &&
    parsedThreshold <= 1
    ? parsedThreshold
    : DEFAULT_CONFIDENCE_THRESHOLD;
}

export function computeFilterDecision(v: GateViolationLike): FilterDecision {
  const reasons: string[] = [];
  const confidenceThreshold = resolveConfidenceThreshold();
  const checks = v.checks;

  const hasRuleQuote = !!v.rule_quote && v.rule_quote.trim() !== "";
  if (!hasRuleQuote) reasons.push("rule_quote_empty");

  const evidenceExact = checks?.evidence_exact === true;
  if (checks?.evidence_exact === false) reasons.push("evidence_exact=false");

  const ruleSupportsClaim = checks?.rule_supports_claim === true;
  if (checks?.rule_supports_claim === false) reasons.push("rule_supports_claim=false");

  const contextSupportsViolation = checks?.context_supports_violation === true;
  if (checks?.context_supports_violation === false) reasons.push("context_supports_violation=false");

  const plausibleNonViolation = checks?.plausible_non_violation === true;
  if (plausibleNonViolation) reasons.push("plausible_non_violation=true");
  const notPlausibleNonViolation = checks?.plausible_non_violation === false;

  const fixIsDropIn = checks?.fix_is_drop_in === true;
  if (checks?.fix_is_drop_in === false) reasons.push("fix_is_drop_in=false");

  const fixPreservesMeaning = checks?.fix_preserves_meaning === true;
  if (checks?.fix_preserves_meaning === false) reasons.push("fix_preserves_meaning=false");

  const hasFix = (v.fix ?? "").trim() !== "";

  const hasConfidence = typeof v.confidence === "number";
  const passesConfidence = hasConfidence && v.confidence >= confidenceThreshold;
  if (!passesConfidence) reasons.push(`confidence<${confidenceThreshold}`);

  const surface =
    ruleSupportsClaim &&
    hasRuleQuote &&
    evidenceExact &&
    contextSupportsViolation &&
    fixIsDropIn &&
    hasFix &&
    fixPreservesMeaning &&
    notPlausibleNonViolation &&
    passesConfidence;

  return { surface, reasons };
}
