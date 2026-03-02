import type { GateChecks } from "../prompts/schema";

export type FilterDecision = {
  surface: boolean;
  reasons: string[];
};

const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;
const CONFIDENCE_THRESHOLD_ENV = "VECTORLINT_CONFIDENCE_THRESHOLD";

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

  return Number.isFinite(parsedThreshold)
    ? parsedThreshold
    : DEFAULT_CONFIDENCE_THRESHOLD;
}

export function computeFilterDecision(v: GateViolationLike): FilterDecision {
  const reasons: string[] = [];
  const confidenceThreshold = resolveConfidenceThreshold();

  const ruleQuoteEmpty = !v.rule_quote || v.rule_quote.trim() === "";
  if (ruleQuoteEmpty) reasons.push("rule_quote_empty");

  if (v.checks?.evidence_exact === false) reasons.push("evidence_exact=false");
  if (v.checks?.rule_supports_claim === false) reasons.push("rule_supports_claim=false");
  if (v.checks?.context_supports_violation === false) reasons.push("context_supports_violation=false");
  if (v.checks?.plausible_non_violation === true) reasons.push("plausible_non_violation=true");
  if (v.checks?.fix_is_drop_in === false) reasons.push("fix_is_drop_in=false");
  if (v.checks?.fix_preserves_meaning === false) reasons.push("fix_preserves_meaning=false");

  if (typeof v.confidence !== "number" || v.confidence < confidenceThreshold) {
    reasons.push(`confidence<${confidenceThreshold}`);
  }

  const fixEmpty = (v.fix ?? "").trim() === "";

  const surface =
    v.checks?.rule_supports_claim === true &&
    !ruleQuoteEmpty &&
    v.checks?.evidence_exact === true &&
    v.checks?.context_supports_violation === true &&
    v.checks?.fix_is_drop_in === true &&
    !fixEmpty &&
    v.checks?.fix_preserves_meaning === true &&
    v.checks?.plausible_non_violation === false &&
    typeof v.confidence === "number" &&
    v.confidence >= confidenceThreshold;

  return { surface, reasons };
}
