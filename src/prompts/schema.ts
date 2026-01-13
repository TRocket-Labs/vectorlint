import { EvaluationType, Severity } from "../evaluators/types";
import type { TokenUsage } from "../providers/token-usage";

export function buildSubjectiveLLMSchema() {
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
                    analysis: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: [
                    "quoted_text",
                    "context_before",
                    "context_after",
                    "analysis",
                    "suggestion",
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

export function buildSemiObjectiveLLMSchema() {
  return {
    name: "vectorlint_check_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
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
            },
            required: [
              "quoted_text",
              "context_before",
              "context_after",
              "description",
              "analysis",
              "suggestion",
            ],
          },
        },
      },
      required: ["violations"],
    },
  } as const;
}

/**
 * Builds the JSON schema for batched Check evaluation.
 * The schema requires the LLM to output violations grouped by rule_id.
 * @param ruleIds - Array of rule IDs that will be evaluated in this batch
 */
export function buildBatchedCheckLLMSchema(ruleIds: string[]) {
  return {
    name: "vectorlint_batched_check_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rules: {
          type: "array",
          description: `Evaluation results for each rule. Must include an entry for each rule: ${ruleIds.join(", ")}`,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              rule_id: {
                type: "string",
                description: `The rule ID being evaluated. Must be one of: ${ruleIds.join(", ")}`,
              },
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
                  },
                  required: [
                    "quoted_text",
                    "context_before",
                    "context_after",
                    "description",
                    "analysis",
                    "suggestion",
                  ],
                },
              },
            },
            required: ["rule_id", "violations"],
          },
        },
      },
      required: ["rules"],
    },
  } as const;
}

export type SubjectiveLLMResult = {
  criteria: Array<{
    name: string;
    score: 1 | 2 | 3 | 4;
    summary: string;
    reasoning: string;
    violations: Array<{
      quoted_text: string;
      context_before: string;
      context_after: string;
      analysis: string;
      suggestion: string;
    }>;
  }>;
};

export type SemiObjectiveLLMResult = {
  violations: Array<{
    description: string;
    analysis: string;
    suggestion?: string;
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
  }>;
};

/**
 * LLM result schema for batched Check evaluation.
 * Multiple rules are evaluated in a single LLM call.
 * Each rule's violations are tagged with its rule_id.
 */
export type BatchedCheckLLMResult = {
  rules: Array<{
    rule_id: string;
    violations: Array<{
      description: string;
      analysis: string;
      suggestion?: string;
      quoted_text?: string;
      context_before?: string;
      context_after?: string;
    }>;
  }>;
};

export type SubjectiveResult = {
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
      quoted_text: string;
      context_before: string;
      context_after: string;
      analysis: string;
      suggestion: string;
    }>;
  }>;
  usage?: TokenUsage;
};

export type SemiObjectiveItem = {
  description: string;
  analysis: string;
  suggestion?: string;
  quoted_text?: string;
  context_before?: string;
  context_after?: string;
};

export type SemiObjectiveResult = {
  type: typeof EvaluationType.CHECK;
  final_score: number; // 1-10
  percentage: number;
  violation_count: number;
  items: Array<SemiObjectiveItem>;
  severity: typeof Severity.WARNING | typeof Severity.ERROR;
  message: string;
  violations: Array<{
    analysis: string;
    suggestion?: string;
    quoted_text?: string;
    context_before?: string;
    context_after?: string;
    criterionName?: string;
  }>;
  usage?: TokenUsage;
};

export type EvaluationResult = SubjectiveResult | SemiObjectiveResult;

export function isSubjectiveResult(
  result: EvaluationResult
): result is SubjectiveResult {
  return result.type === EvaluationType.JUDGE;
}

export function isSemiObjectiveResult(
  result: EvaluationResult
): result is SemiObjectiveResult {
  return result.type === EvaluationType.CHECK;
}
