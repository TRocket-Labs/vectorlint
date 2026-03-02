import { EvaluationType, Severity } from "../evaluators/types";
import type { TokenUsage } from "../providers/token-usage";

export type GateChecks = {
  rule_supports_claim: boolean;
  evidence_exact: boolean;
  context_supports_violation: boolean;
  plausible_non_violation: boolean;
  fix_is_drop_in: boolean;
  fix_preserves_meaning: boolean;
};

export type GateCheckNotes = {
  rule_supports_claim: string;
  evidence_exact: string;
  context_supports_violation: string;
  plausible_non_violation: string;
  fix_is_drop_in: string;
  fix_preserves_meaning: string;
};

export function buildJudgeLLMSchema() {
  return {
    name: "vectorlint_judge_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        criteria: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              reasoning: {
                type: "string",
                description:
                  "Thorough step-by-step logic for the evaluation of this specific criterion.",
              },
              name: { type: "string" },
              summary: { type: "string" },
              score: { type: "number", enum: [1, 2, 3, 4] },
              violations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    line: { type: "number" },
                    quoted_text: { type: "string" },
                    context_before: { type: "string" },
                    context_after: { type: "string" },
                    description: { type: "string" },
                    analysis: { type: "string" },
                    suggestion: { type: "string" },
                    fix: { type: "string" },
                    rule_quote: { type: "string" },
                    checks: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        rule_supports_claim: { type: "boolean" },
                        evidence_exact: { type: "boolean" },
                        context_supports_violation: { type: "boolean" },
                        plausible_non_violation: { type: "boolean" },
                        fix_is_drop_in: { type: "boolean" },
                        fix_preserves_meaning: { type: "boolean" },
                      },
                      required: [
                        "rule_supports_claim",
                        "evidence_exact",
                        "context_supports_violation",
                        "plausible_non_violation",
                        "fix_is_drop_in",
                        "fix_preserves_meaning",
                      ],
                    },
                    check_notes: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        rule_supports_claim: { type: "string" },
                        evidence_exact: { type: "string" },
                        context_supports_violation: { type: "string" },
                        plausible_non_violation: { type: "string" },
                        fix_is_drop_in: { type: "string" },
                        fix_preserves_meaning: { type: "string" },
                      },
                      required: [
                        "rule_supports_claim",
                        "evidence_exact",
                        "context_supports_violation",
                        "plausible_non_violation",
                        "fix_is_drop_in",
                        "fix_preserves_meaning",
                      ],
                    },
                    confidence: { type: "number" },
                  },
                  required: [
                    "line",
                    "quoted_text",
                    "context_before",
                    "context_after",
                    "description",
                    "analysis",
                    "suggestion",
                    "fix",
                    "rule_quote",
                    "checks",
                    "check_notes",
                    "confidence",
                  ],
                },
              },
            },
            required: ["reasoning", "name", "score", "summary", "violations"],
          },
        },
      },
      required: ["criteria"],
    },
  } as const;
}

export function buildCheckLLMSchema() {
  return {
    name: "vectorlint_check_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reasoning: { type: "string" },
        violations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              line: { type: "number" },
              quoted_text: { type: "string" },
              context_before: { type: "string" },
              context_after: { type: "string" },
              description: { type: "string" },
              analysis: { type: "string" },
              suggestion: { type: "string" },
              fix: { type: "string" },
              rule_quote: { type: "string" },
              checks: {
                type: "object",
                additionalProperties: false,
                properties: {
                  rule_supports_claim: { type: "boolean" },
                  evidence_exact: { type: "boolean" },
                  context_supports_violation: { type: "boolean" },
                  plausible_non_violation: { type: "boolean" },
                  fix_is_drop_in: { type: "boolean" },
                  fix_preserves_meaning: { type: "boolean" },
                },
                required: [
                  "rule_supports_claim",
                  "evidence_exact",
                  "context_supports_violation",
                  "plausible_non_violation",
                  "fix_is_drop_in",
                  "fix_preserves_meaning",
                ],
              },
              check_notes: {
                type: "object",
                additionalProperties: false,
                properties: {
                  rule_supports_claim: { type: "string" },
                  evidence_exact: { type: "string" },
                  context_supports_violation: { type: "string" },
                  plausible_non_violation: { type: "string" },
                  fix_is_drop_in: { type: "string" },
                  fix_preserves_meaning: { type: "string" },
                },
                required: [
                  "rule_supports_claim",
                  "evidence_exact",
                  "context_supports_violation",
                  "plausible_non_violation",
                  "fix_is_drop_in",
                  "fix_preserves_meaning",
                ],
              },
              confidence: { type: "number" },
            },
            required: [
              "line",
              "quoted_text",
              "context_before",
              "context_after",
              "description",
              "analysis",
              "suggestion",
              "fix",
              "rule_quote",
              "checks",
              "check_notes",
              "confidence",
            ],
          },
        },
      },
      required: ["reasoning", "violations"],
    },
  } as const;
}

export type JudgeLLMResult = {
  criteria: Array<{
    name: string;
    score: 1 | 2 | 3 | 4;
    summary: string;
    reasoning: string;
    violations: Array<{
      line: number;
      quoted_text: string;
      context_before: string;
      context_after: string;
      description: string;
      analysis: string;
      suggestion: string;
      fix: string;
      rule_quote: string;
      checks: GateChecks;
      check_notes: GateCheckNotes;
      confidence: number;
    }>;
  }>;
};

export type CheckLLMResult = {
  reasoning: string;
  violations: Array<{
    line: number;
    description: string;
    analysis: string;
    suggestion: string;
    fix: string;
    quoted_text: string;
    context_before: string;
    context_after: string;
    rule_quote: string;
    checks: GateChecks;
    check_notes: GateCheckNotes;
    confidence: number;
  }>;
};

export type JudgeResult = {
  type: typeof EvaluationType.JUDGE;
  final_score: number; // 1-10
  criteria: Array<{
    name: string;
    weight: number;
    score: 1 | 2 | 3 | 4;
    normalized_score: number;
    weighted_points: number;
    summary: string;
    reasoning: string;
    violations: Array<{
      line: number;
      quoted_text: string;
      context_before: string;
      context_after: string;
      description: string;
      analysis: string;
      suggestion: string;
      fix: string;
      rule_quote: string;
      checks: GateChecks;
      check_notes: GateCheckNotes;
      confidence: number;
    }>;
  }>;
  usage?: TokenUsage;
  raw_model_output?: unknown;
};

export type CheckItem = {
  line: number;
  description: string;
  analysis: string;
  suggestion?: string;
  fix?: string;
  quoted_text?: string;
  context_before?: string;
  context_after?: string;
  rule_quote?: string;
  checks?: GateChecks;
  check_notes?: GateCheckNotes;
  confidence?: number;
};

export type CheckResult = {
  type: typeof EvaluationType.CHECK;
  final_score: number; // 1-10
  percentage: number;
  violation_count: number;
  items: Array<CheckItem>;
  severity: typeof Severity.WARNING | typeof Severity.ERROR;
  message: string;
  reasoning?: string;
  violations: Array<{
    line?: number;
    analysis: string;
    suggestion?: string;
    fix?: string;
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
    criterionName?: string;
    description?: string;
    rule_quote?: string;
    checks?: GateChecks;
    check_notes?: GateCheckNotes;
    confidence?: number;
  }>;
  usage?: TokenUsage;
  raw_model_output?: unknown;
};

export type PromptEvaluationResult = JudgeResult | CheckResult;

export function isJudgeResult(
  result: PromptEvaluationResult
): result is JudgeResult {
  return result.type === EvaluationType.JUDGE;
}

export function isCheckResult(
  result: PromptEvaluationResult
): result is CheckResult {
  return result.type === EvaluationType.CHECK;
}
