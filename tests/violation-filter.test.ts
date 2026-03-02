import { afterEach, describe, expect, it } from "vitest";
import { computeFilterDecision } from "../src/evaluators/violation-filter";

const ORIGINAL_THRESHOLD = process.env.CONFIDENCE_THRESHOLD;

afterEach(() => {
  if (ORIGINAL_THRESHOLD === undefined) {
    delete process.env.CONFIDENCE_THRESHOLD;
  } else {
    process.env.CONFIDENCE_THRESHOLD = ORIGINAL_THRESHOLD;
  }
});

const BASE_VIOLATION = {
  rule_quote: "Rule quote",
  fix: "Fix text",
  confidence: 0.7,
  checks: {
    rule_supports_claim: true,
    evidence_exact: true,
    context_supports_violation: true,
    plausible_non_violation: false,
    fix_is_drop_in: true,
    fix_preserves_meaning: true,
  },
};

describe("computeFilterDecision confidence threshold", () => {
  it("falls back to 0.75 when threshold env var is invalid", () => {
    process.env.CONFIDENCE_THRESHOLD = "not-a-number";

    const decision = computeFilterDecision(BASE_VIOLATION);
    expect(decision.surface).toBe(false);
    expect(decision.reasons).toContain("confidence<0.75");
  });

  it("accepts 0.0 threshold without falling back", () => {
    process.env.CONFIDENCE_THRESHOLD = "0.0";

    const decision = computeFilterDecision(BASE_VIOLATION);
    expect(decision.surface).toBe(true);
  });
});
